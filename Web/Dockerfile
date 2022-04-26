FROM node:latest

## Create directories
RUN mkdir -p /fox/web
RUN mkdir -p /fox/storage

WORKDIR /fox/web
COPY src .
RUN npm install
