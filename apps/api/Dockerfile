FROM golang:1.25.11-alpine AS builder

WORKDIR /app

# Copy go mod files (go.sum may not exist for stdlib-only modules)
COPY apps/api/go.mod ./
RUN go mod download

# Copy source
COPY apps/api ./
RUN CGO_ENABLED=0 go build -o /api .

FROM alpine:3.23
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /api .
COPY packages/shared/migrations /app/packages/shared/migrations
COPY packages/shared/seed.sql /app/packages/shared/seed.sql
ENV MIGRATIONS_DIR=/app/packages/shared/migrations
ENV SEED_FILE=/app/packages/shared/seed.sql
EXPOSE 8080
CMD ["./api"]
