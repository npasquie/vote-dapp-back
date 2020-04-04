FROM node:lts
COPY package.json yarn.lock ./
RUN yarn install
COPY . .
CMD if [ $NODE_ENV = "development" ]; \
    then yarn global add nodemon; \
    nodemon back.js; \
    else node back.js; \
    fi