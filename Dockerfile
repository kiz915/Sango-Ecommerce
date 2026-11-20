# ===================================================================
# Sango Fiora — Full-Stack Single Service Docker Build
# Stage 1: Build Frontend (Eleventy + Tailwind)
# Stage 2: Build Spring Boot 3 Backend with packaged frontend
# Stage 3: Lightweight JRE 21 Runtime Container
# ===================================================================

# ---- Stage 1: Build Frontend ----
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Install npm dependencies
COPY package*.json ./
RUN npm ci

# Copy full source and build Eleventy static distribution
COPY . .
RUN npm run build

# ---- Stage 2: Build Spring Boot Backend ----
FROM eclipse-temurin:21-jdk-alpine AS backend-builder
WORKDIR /app

# Copy Maven wrapper & pom
COPY backend/mvnw backend/pom.xml ./
COPY backend/.mvn ./.mvn

# Download dependencies
RUN chmod +x ./mvnw && ./mvnw -B dependency:go-offline -DskipTests

# Copy backend source
COPY backend/src ./src

# Inject built static frontend into Spring Boot classpath resources
COPY --from=frontend-builder /app/_site ./src/main/resources/static-frontend

# Compile & package production JAR
RUN ./mvnw -B clean package -DskipTests

# ---- Stage 3: Runtime Container ----
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create uploads directory and give ownership to appuser
RUN mkdir -p /app/uploads/plants && chown -R appuser:appgroup /app

# Copy JAR from build stage
COPY --from=backend-builder /app/target/*.jar app.jar
RUN chown appuser:appgroup app.jar

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+UseG1GC -XX:+UseStringDeduplication"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
