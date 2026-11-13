from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "OAN Reports Central API"
    app_env: str = "development"
    api_prefix: str = "/api"
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    # PostgreSQL — required for team/server. Example:
    # postgresql+psycopg2://oan:oan@localhost:5432/oan_reports
    database_url: str = "postgresql+psycopg2://oan:oan@localhost:5432/oan_reports"

    # Upstream chart services (Postman collections). Leave blank to return empty data.
    upstream_a2c_base_url: str = ""
    upstream_grievance_base_url: str = ""
    upstream_farmer_base_url: str = ""
    upstream_livestock_base_url: str = ""
    upstream_crop_base_url: str = ""
    # Optional gateway that accepts ?charts=a,b
    upstream_gateway_base_url: str = ""

    upstream_timeout_seconds: float = 20.0
    seed_on_startup: bool = True

    # Keycloak client-credentials token sent to the upstreams in UPSTREAM_AUTH_SERVICES (the registry
    # dashboard-apis). Leave OIDC_TOKEN_URL blank to call every upstream without a token.
    oidc_token_url: str = ""
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    upstream_auth_services: str = "farmer,livestock,crop"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def upstream_auth_service_list(self) -> list[str]:
        return [s.strip() for s in self.upstream_auth_services.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
