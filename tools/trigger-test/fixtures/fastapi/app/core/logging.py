import logging.config


def configure_logging(level: str = "INFO", json_logs: bool = True) -> None:
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": {
                # Adds record.correlation_id (the request id) to every log record.
                "request_id": {"()": "asgi_correlation_id.CorrelationIdFilter", "default_value": "-"},
            },
            "formatters": {
                "json": {
                    "()": "pythonjsonlogger.json.JsonFormatter",
                    "fmt": "%(asctime)s %(levelname)s %(name)s %(message)s %(correlation_id)s",
                    "rename_fields": {"levelname": "level", "asctime": "time", "correlation_id": "request_id"},
                },
                "text": {"format": "%(asctime)s %(levelname)s [%(correlation_id)s] %(name)s: %(message)s"},
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "filters": ["request_id"],
                    "formatter": "json" if json_logs else "text",
                },
            },
            "root": {"handlers": ["default"], "level": level},
            "loggers": {
                # Send uvicorn's logs through the same JSON handler instead of its own.
                "uvicorn": {"handlers": [], "propagate": True},
                "uvicorn.error": {"handlers": [], "propagate": True},
                "uvicorn.access": {"handlers": [], "propagate": True},
                "sqlalchemy.engine": {"level": "WARNING"},  # INFO logs every SQL statement
            },
        }
    )
