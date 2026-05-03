"""Live call transcript viewer + settings -- Flask + SSE."""

import os
import logging

from flask import Flask

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("translator")

_package_dir = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(_package_dir, "templates"),
    static_folder=os.path.join(_package_dir, "static"),
)

from .routes import register_routes  # noqa: E402

register_routes(app)
