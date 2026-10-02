with open("tests/test_ambassador.py", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('sub = new_sub(verified=False)\n    r = client.post("/v1/ambassador/application", json={"answers": {"why": "x", "ideas": "y", "role": "Student"}, "idempotency_key": "x"}, headers=auth(sub))', 'sub = new_sub()\n    r = client.post("/v1/ambassador/application", json={"answers": {"why": "x", "ideas": "y", "role": "Student"}, "idempotency_key": "x"}, headers={"Authorization": f"Bearer {make_token(sub, ev=False)}"})')

with open("tests/test_ambassador.py", "w", encoding="utf-8") as f:
    f.write(content)
