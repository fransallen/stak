export const SAMPLE_COMPOSE = `version: "3.9"

services:
  web:
    image: nginx:1.25
    ports:
      - "80:80"
    depends_on:
      - api
    networks:
      - frontend
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro

  api:
    build: ./api
    image: ghcr.io/acme/api:1.4.2
    environment:
      LOG_LEVEL: info
    env_file:
      - ./api.env
    depends_on:
      - db
      - cache
    networks:
      - frontend
      - backend
    secrets:
      - db_password
    configs:
      - source: api_config
        target: /etc/api/config.yaml
    volumes:
      - api-data:/var/data

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: shop
      POSTGRES_USER: shop
    secrets:
      - db_password
    networks:
      - backend
    volumes:
      - db-data:/var/lib/postgresql/data

  cache:
    image: redis:7
    networks:
      - backend

volumes:
  api-data:
  db-data:

networks:
  frontend:
  backend:

secrets:
  db_password:
    file: ./secrets/db_password.txt

configs:
  api_config:
    file: ./configs/api.yaml
`;
