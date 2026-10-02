with open("tests/test_ambassador.py", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('assert data["closed_reason"] == "verify_email"', 'assert "Verify your college email" in data["closed_reason"]')
content = content.replace('assert data["open"] is False\n\ndef test_valid_submit_creates_application', 'assert data["open"] is False\n    assert "Applications are currently closed" in data["closed_reason"]\n\ndef test_valid_submit_creates_application')

with open("tests/test_ambassador.py", "w", encoding="utf-8") as f:
    f.write(content)
