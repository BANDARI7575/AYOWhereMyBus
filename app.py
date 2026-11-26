"""Compatible Flask/Gunicorn entry point. Implementation lives in backend.app."""
from backend.app import app
from werkzeug.serving import WSGIRequestHandler


class PrivateDevelopmentRequestHandler(WSGIRequestHandler):
    """Keep private device-test request targets out of development logs."""

    def log_request(self, code="-", size="-"):
        self.log("info", "HTTP response %s (%s bytes)", code, size)

    def log_error(self, format, *args):
        # A malformed HTTP request can be included verbatim in an error message.
        self.log("error", "HTTP request could not be processed.")

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False,
            request_handler=PrivateDevelopmentRequestHandler)
