"""Entry point — run the Flask web UI."""

import logging
from web import app

if __name__ == "__main__":
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    app.run(host="127.0.0.1", port=5050, debug=False, threaded=True)
