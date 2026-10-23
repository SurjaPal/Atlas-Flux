FROM node:18-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install
RUN npm install -g nodemon

# Copy all project files
COPY . .

# Expose the dashboard port
EXPOSE 3000

# Use nodemon with -L (Legacy Watch / Polling) to detect Windows host file changes correctly
CMD ["nodemon", "-L", "--watch", ".", "-e", "js,html", "--exec", "npx hardhat run liveDemo.js"]
