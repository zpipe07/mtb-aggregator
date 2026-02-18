FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY apps/api/go.mod apps/api/go.sum ./
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
