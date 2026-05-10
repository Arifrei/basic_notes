from __future__ import annotations

from pathlib import Path

import click
from dotenv import load_dotenv
from flask import Flask

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from .config import Config
from .database import db


def create_app(config_class: type[Config] = Config) -> Flask:
    app = Flask(__name__, static_folder="../static", template_folder="../templates")
    app.config.from_object(config_class)

    db.init_app(app)

    from .views import bp

    app.register_blueprint(bp)
    register_cli(app)

    if app.config["AUTO_INIT_DB"]:
        with app.app_context():
            db.create_all()

    return app


def register_cli(app: Flask) -> None:
    @app.cli.command("init-db")
    def init_db_command() -> None:
        """Create the database tables."""
        with app.app_context():
            db.create_all()
        click.echo("Database initialized.")
