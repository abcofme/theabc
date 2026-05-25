import logging
import sys

from loguru import logger

from settings import settings

logger_format = (
    "<cyan>[ {time:YYYY.MM.DD HH:mm:ss.SS} ]</cyan>"
    "<red> [ <level>{level}</level> ] </red>"
    "<magenta>[ {name} ]</magenta> <yellow>[ {function} ]</yellow> <blue>[ {line} ]</blue> --> {message}"
)


def hide_secrets(record: dict):
    record['message'] = record['message'].replace(settings.BOT_TOKEN, '[BOT_TOKEN]')
    record['message'] = record['message'].replace(settings.POSTGRES_PASSWORD, '[POSTGRES_PASSWORD]')
    record['message'] = record['message'].replace(settings.REDIS_PASSWORD, '[REDIS_PASSWORD]')


def configure_logger():
    log_level = logging.DEBUG if settings.DEBUG else logging.INFO
    logger.remove(0)
    logger.add(
        sink=sys.stdout,
        level=log_level,
        format=logger_format,
        backtrace=False,
        colorize=True,
    )
    logger.configure(patcher=hide_secrets)

    logging.getLogger('sqlalchemy.engine').setLevel(log_level)

    logging.basicConfig(level=log_level, force=True, handlers=[InterceptHandler()])
    root = logging.getLogger()
    root.setLevel(log_level)
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)


class InterceptHandler(logging.Handler):
    def emit(self, record):
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        frame, depth = logging.currentframe(), 0
        skip = True
        while (is_log_frame := frame.f_code.co_filename == logging.__file__) or skip:
            if skip and is_log_frame:
                skip = False
            frame = frame.f_back
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())
