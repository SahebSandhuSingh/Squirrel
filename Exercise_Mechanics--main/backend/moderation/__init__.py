"""Reports: a member flags another member (or one of their sessions) for moderation review.

Each report is a record for admin review: who reported, whom or what, the category, a description,
when, and its status. The reported member is never told who reported them, and no member-facing
route lists reports made against someone. Reporting does not block: blocking stays a separate
action (partners/ and activity_matching/ share one block list).

    data/moderation/reports/<report_id>.json
"""
