FROM python:3.11.6-alpine3.18
RUN apk add --no-cache postgresql-client
RUN chmod 755 .
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . /app
COPY ./migrations /app/migrations

WORKDIR /app

CMD ["python", "run.py"]