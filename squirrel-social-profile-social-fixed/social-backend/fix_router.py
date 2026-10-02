import re

with open("app/routers/ambassador.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. move social import
content = content.replace("from app.services import notify", "from app.services import notify, social")
content = content.replace("    from app.services import social\n", "")

# 2. fix not_found/conflict import
content = content.replace("from app.errors import forbidden, invalid", "from app.errors import forbidden, invalid, not_found, conflict")

# 3. GET /ambassador/application
get_ambassador_pattern = r'''    member = db\.get\(Member, viewer\.id\)
    if not member or not member\.email_verified:
        return AmbassadorState\(
            open=False, 
            closed_reason="verify_email", 
            application=_serialize_app\(app\), 
            fields=\[\]
        \)
    
    # 2\. Reapply cooldown
    if app and app\.status == "rejected" and app\.decided_at:
        if utcnow\(\) < app\.decided_at \+ timedelta\(days=settings\.ambassador_reapply_days\):
            return AmbassadorState\(
                open=False,
                closed_reason="reapply_later",
                application=_serialize_app\(app\),
                fields=\[\]
            \)
            
    # 3\. Settings open flag
    if not settings\.ambassador_open:
        return AmbassadorState\(
            open=False,
            closed_reason="Check back soon.*?",
            application=_serialize_app\(app\),
            fields=\[\]
        \)'''

new_get = '''    member = db.get(Member, viewer.id)
    if not member or not member.email_verified:
        return AmbassadorState(
            open=False, 
            closed_reason="Verify your college email to apply.", 
            application=_serialize_app(app), 
            fields=[]
        )
    
    # 2. Reapply cooldown
    if app and app.status == "rejected" and app.decided_at:
        wait_until = app.decided_at + timedelta(days=settings.ambassador_reapply_days)
        if utcnow() < wait_until:
            date_str = wait_until.strftime("%b %d, %Y").replace(" 0", " ")
            return AmbassadorState(
                open=False,
                closed_reason=f"You can apply again on {date_str}.",
                application=_serialize_app(app),
                fields=[]
            )
            
    # 3. Settings open flag
    if not settings.ambassador_open:
        return AmbassadorState(
            open=False,
            closed_reason="Applications are currently closed. Check back soon.",
            application=_serialize_app(app),
            fields=[]
        )'''
content = re.sub(get_ambassador_pattern, new_get, content, flags=re.DOTALL)

# 4. POST /ambassador/application
post_start = '''    existing = db.scalar(select(AmbassadorApplication).where(AmbassadorApplication.user_id == viewer.id, AmbassadorApplication.idempotency_key == body.idempotency_key))
    if existing:
        return _serialize_app(existing)'''

post_gates = '''    existing = db.scalar(select(AmbassadorApplication).where(AmbassadorApplication.user_id == viewer.id, AmbassadorApplication.idempotency_key == body.idempotency_key))
    if existing:
        return _serialize_app(existing)

    if not settings.ambassador_open:
        raise forbidden("Applications are currently closed. Check back soon.")

    member = db.get(Member, viewer.id)
    if not member or not member.email_verified:
        raise forbidden("Verify your college email to apply.")

    last_app = db.scalar(select(AmbassadorApplication).where(AmbassadorApplication.user_id == viewer.id).order_by(AmbassadorApplication.submitted_at.desc()).limit(1))
    if last_app and last_app.status == "rejected" and last_app.decided_at:
        if utcnow() < last_app.decided_at + timedelta(days=settings.ambassador_reapply_days):
            raise forbidden("You cannot reapply yet.")'''

content = content.replace(post_start, post_gates)

# 5. POST integrity error
commit_pattern = r'''    app = AmbassadorApplication\(
        user_id=viewer\.id,
        status="pending",
        form_version=AMBASSADOR_FORM_VERSION,
        answers=answers,
        idempotency_key=body\.idempotency_key
    \)
    db\.add\(app\)
    db\.flush\(\)
    db\.commit\(\)
    
    return _serialize_app\(app\)'''

new_commit = '''    import sqlalchemy.exc
    app = AmbassadorApplication(
        user_id=viewer.id,
        status="pending",
        form_version=AMBASSADOR_FORM_VERSION,
        answers=answers,
        idempotency_key=body.idempotency_key
    )
    db.add(app)
    try:
        db.flush()
        db.commit()
    except sqlalchemy.exc.IntegrityError:
        db.rollback()
        open_app = db.scalar(
            select(AmbassadorApplication)
            .where(AmbassadorApplication.user_id == viewer.id, AmbassadorApplication.status.in_(["pending", "under_review", "approved"]))
        )
        return _serialize_app(open_app)
    
    return _serialize_app(app)'''

content = re.sub(commit_pattern, new_commit, content)

# 6. Admin list signature
new_admin_list = 'from typing import Literal\n@router.get("/admin/ambassador/applications", response_model=AdminAmbassadorList)\ndef list_ambassador_applications(db: DB, viewer: CurrentViewer, settings: AppSettings, storage: Storage, status: Literal["pending", "under_review", "approved", "rejected"] | None = None, limit: int = 50):\n    _check_admin(viewer.user)\n\n    query = select(AmbassadorApplication, User, UserStats.xp).join(User, User.id == AmbassadorApplication.user_id).join(UserStats, UserStats.user_id == User.id)\n    if status:\n        query = query.where(AmbassadorApplication.status == status)\n    query = query.order_by(AmbassadorApplication.submitted_at.desc()).limit(limit)\n    rows = db.execute(query).all()'

content = re.sub(r'@router\.get\("/admin/ambassador/applications".*?rows = db\.execute\([^)]+\)\.all\(\)', new_admin_list, content, flags=re.DOTALL)

# 7. Admin decision route
decision_pattern = r'''    app = db\.get\(AmbassadorApplication, id\)
    if not app:
        raise invalid\("Application not found"\)
        
    app\.status = body\.status
    if body\.status in \("approved", "rejected"\):
        app\.decided_at = utcnow\(\)
    app\.message = body\.message'''

new_decision = '''    app = db.get(AmbassadorApplication, id)
    if not app:
        raise not_found("Application not found")
        
    if app.status in ("approved", "rejected"):
        raise conflict("Already decided")
        
    if app.status == "pending" and body.status not in ("under_review", "approved", "rejected"):
        raise conflict("Invalid transition")
        
    if app.status == "under_review" and body.status not in ("approved", "rejected"):
        raise conflict("Invalid transition")
        
    app.status = body.status
    if body.status in ("approved", "rejected"):
        app.decided_at = utcnow()
    app.message = body.message'''

content = re.sub(decision_pattern, new_decision, content)

with open("app/routers/ambassador.py", "w", encoding="utf-8") as f:
    f.write(content)
