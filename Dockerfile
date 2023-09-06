FROM node:18.12.1-bullseye-slim
WORKDIR /app
RUN npm install -g typescript@4.8.4

# 언어 관련
RUN mkdir -p /usr/share/fonts/nanumfont
RUN apt-get update && apt-get install -y curl zip fontconfig
RUN curl http://cdn.naver.com/naver/NanumFont/fontfiles/NanumFont_TTF_ALL.zip -o NanumFont_TTF_ALL.zip
RUN unzip NanumFont_TTF_ALL.zip -d /usr/share/fonts/nanumfont
RUN fc-cache -f -v
ENV LANG=ko_KR.UTF-8
ENV LANGUAGE=ko_KR.UTF-8

# chromium, puppeteer관련
RUN apt-get update && apt-get install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2

RUN apt-get -y install tzdata && \
  cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
  echo "Asia/Seoul" > /etc/timezone
RUN date

# apt-get install chromium=109.0.5414.74-2~deb11u1
RUN apt-get install -y chromium 
RUN rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package.json package-lock.json* ./

RUN npm ci

ADD . ./

ENV PATH /app/node_modules/.bin:$PATH

RUN tsc

CMD tsc -watch

