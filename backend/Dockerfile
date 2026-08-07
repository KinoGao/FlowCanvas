FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /app/backend
COPY backend/pom.xml .
RUN mvn dependency:go-offline -B
COPY backend/src ./src
RUN mvn package -DskipTests -B

FROM eclipse-temurin:21-jre

WORKDIR /app
COPY --from=build /app/backend/target/*.jar /app/backend.jar

ENV DB_PATH=/app/data/app.db
ENV PORT=9801
EXPOSE 9801

CMD ["sh", "-c", "java -jar /app/backend.jar"]