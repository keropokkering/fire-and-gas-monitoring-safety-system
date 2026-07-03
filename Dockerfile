FROM nginx:alpine

# Copy dashboard static files to Nginx server html directory
COPY index.html /usr/share/nginx/html/index.html
COPY style.css /usr/share/nginx/html/style.css
COPY app.js /usr/share/nginx/html/app.js
COPY auth.js /usr/share/nginx/html/auth.js
COPY login.html /usr/share/nginx/html/login.html

# Set login.html as the default entry page by replacing Nginx default config
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index login.html;\n  location / { try_files $uri $uri/ =404; }\n}\n' > /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80
