from fastapi.testclient import TestClient

from app.services.security import COOKIE_NAME


def _register(
    client: TestClient,
    *,
    email: str = "user@example.com",
    password: str = "password123",
    name: str = "Test User",
) -> object:
    return client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password},
    )


def test_register_creates_user_and_sets_cookie(client: TestClient) -> None:
    response = _register(client)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "user@example.com"
    assert data["name"] == "Test User"
    assert "id" in data
    assert "created_at" in data
    assert "password" not in data
    assert "password_hash" not in data
    assert COOKIE_NAME in response.cookies
    cookie = response.cookies[COOKIE_NAME]
    assert cookie


def test_register_duplicate_email_returns_409(client: TestClient) -> None:
    assert _register(client, email="dup@example.com").status_code == 201
    response = _register(client, email="Dup@Example.com", name="Other")
    assert response.status_code == 409
    assert "email" in response.json()["detail"].lower()


def test_register_short_password_returns_422(client: TestClient) -> None:
    response = _register(client, password="short")
    assert response.status_code == 422


def test_login_success(client: TestClient) -> None:
    _register(client, email="login@example.com", password="password123")
    # Clear cookies so login must set a new one
    client.cookies.clear()
    response = client.post(
        "/api/auth/login",
        json={"email": "login@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    assert response.json()["email"] == "login@example.com"
    assert COOKIE_NAME in response.cookies


def test_login_wrong_password(client: TestClient) -> None:
    _register(client, email="wrongpw@example.com", password="password123")
    client.cookies.clear()
    response = client.post(
        "/api/auth/login",
        json={"email": "wrongpw@example.com", "password": "not-the-password"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_login_unknown_email_same_message(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "missing@example.com", "password": "password123"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_me_with_cookie(client: TestClient) -> None:
    _register(client, email="me@example.com", name="Me User")
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"
    assert response.json()["name"] == "Me User"


def test_me_without_cookie(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_logout_clears_cookie(client: TestClient) -> None:
    _register(client, email="logout@example.com")
    assert client.get("/api/auth/me").status_code == 200

    response = client.post("/api/auth/logout")
    assert response.status_code == 204

    # Starlette TestClient may keep cookies unless cleared; check Set-Cookie header
    set_cookie = response.headers.get("set-cookie", "").lower()
    assert COOKIE_NAME in set_cookie
    assert "max-age=0" in set_cookie or "expires=" in set_cookie

    client.cookies.clear()
    assert client.get("/api/auth/me").status_code == 401


def test_register_title_cases_name(client: TestClient) -> None:
    response = _register(client, email="cased@example.com", name="jane doe")
    assert response.status_code == 201
    assert response.json()["name"] == "Jane Doe"


def test_login_remember_me_sets_longer_cookie(client: TestClient) -> None:
    _register(client, email="remember@example.com", password="password123")
    client.cookies.clear()
    response = client.post(
        "/api/auth/login",
        json={
            "email": "remember@example.com",
            "password": "password123",
            "remember_me": True,
        },
    )
    assert response.status_code == 200
    set_cookie = response.headers.get("set-cookie", "").lower()
    assert "max-age=" in set_cookie
    # 30 days in seconds
    assert "2592000" in set_cookie


def test_forgot_and_reset_password_flow(
    client: TestClient, monkeypatch: object
) -> None:
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "expose_dev_reset_link", True)

    _register(client, email="resetme@example.com", password="password123")
    client.cookies.clear()

    forgot = client.post(
        "/api/auth/forgot-password",
        json={"email": "resetme@example.com"},
    )
    assert forgot.status_code == 200
    body = forgot.json()
    assert "detail" in body
    assert body["dev_reset_url"]
    token = body["dev_reset_url"].split("token=")[-1]
    assert token

    unknown = client.post(
        "/api/auth/forgot-password",
        json={"email": "nobody@example.com"},
    )
    assert unknown.status_code == 200
    assert unknown.json()["detail"] == body["detail"]
    assert unknown.json().get("dev_reset_url") is None

    reset = client.post(
        "/api/auth/reset-password",
        json={"token": token, "password": "newpassword99"},
    )
    assert reset.status_code == 204

    bad_login = client.post(
        "/api/auth/login",
        json={"email": "resetme@example.com", "password": "password123"},
    )
    assert bad_login.status_code == 401

    good_login = client.post(
        "/api/auth/login",
        json={"email": "resetme@example.com", "password": "newpassword99"},
    )
    assert good_login.status_code == 200
