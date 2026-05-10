import os

from software_eval import create_app


app = create_app()


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5004")),
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
    )
