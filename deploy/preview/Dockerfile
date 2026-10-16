# syntax=docker/dockerfile:1.7
FROM maven:3.9.11-eclipse-temurin-21 AS build
RUN find /etc/apt -type f \( -name '*.sources' -o -name sources.list \) -exec sed -i 's|http://ports.ubuntu.com/|https://ports.ubuntu.com/|g;s|http://archive.ubuntu.com/|https://archive.ubuntu.com/|g;s|http://security.ubuntu.com/|https://security.ubuntu.com/|g' {} + \
    && apt-get -o Acquire::Retries=3 update \
    && apt-get -o Acquire::Retries=3 install -y --no-install-recommends patch \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
ADD --checksum=sha256:49ac85cd98e28df60fe2dd42cbd9cadc2a6461a29a5259ce186e24da3c45be74 https://codeload.github.com/kekingcn/kkFileView/tar.gz/refs/tags/v5.0.3 /tmp/kk.tar.gz
RUN tar -xzf /tmp/kk.tar.gz --strip-components=1 -C /build
COPY office-lifecycle.patch /tmp/office-lifecycle.patch
RUN patch -p1 < /tmp/office-lifecycle.patch
RUN --mount=type=cache,target=/root/.m2 mvn -B -DskipTests package

FROM eclipse-temurin:21-jre
RUN find /etc/apt -type f \( -name '*.sources' -o -name sources.list \) -exec sed -i 's|http://ports.ubuntu.com/|https://ports.ubuntu.com/|g;s|http://archive.ubuntu.com/|https://archive.ubuntu.com/|g;s|http://security.ubuntu.com/|https://security.ubuntu.com/|g' {} + \
    && apt-get -o Acquire::Retries=3 update \
    && apt-get -o Acquire::Retries=3 install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress fonts-noto-cjk fonts-liberation curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 preview
WORKDIR /app
COPY --from=build /build/server/target/kkFileView-5.0.3.jar /app/bin/kkfileview.jar
COPY --from=build /build/server/src/main/config/application.properties /app/config/application.properties
COPY application.properties /app/neozebra.properties
RUN printf '\n' >> /app/config/application.properties && cat /app/neozebra.properties >> /app/config/application.properties && rm /app/neozebra.properties && mkdir -p /app/cache && chown -R preview:preview /app
USER preview
ENV KKFILEVIEW_BIN_FOLDER=/app/bin KK_OFFICE_HOME=/usr/lib/libreoffice KK_FILE_DIR=/app/cache/ KK_TRUST_HOST=host.docker.internal
EXPOSE 8012
ENTRYPOINT ["java","-Xms128m","-Xmx768m","-Dfile.encoding=UTF-8","-Dspring.config.location=/app/config/application.properties","-jar","/app/bin/kkfileview.jar"]
