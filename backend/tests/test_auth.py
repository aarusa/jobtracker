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
