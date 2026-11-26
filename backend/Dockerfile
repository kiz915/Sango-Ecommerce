# ===================================================================
# Sango Fiora Backend - Standalone & Fallback Build
# ===================================================================

FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /app

COPY mvnw pom.xml ./
COPY .mvn .mvn

RUN sed -i 's/\r$//' ./mvnw && chmod +x ./mvnw && ./mvnw -B dependency:go-offline -DskipTests

COPY src ./src

RUN ./mvnw -B clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/target/*.jar app.jar
RUN chown appuser:appgroup app.jar

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+UseG1GC -XX:+UseStringDeduplication"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
