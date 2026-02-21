FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go mod files (go.sum may not exist for stdlib-only modules)
COPY apps/api/go.mod ./
RUN go mod download

# Copy source
COPY apps/api ./
RUN CGO_ENABLED=0 go build -o /api .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /api .
EXPOSE 8080
CMD ["./api"]
