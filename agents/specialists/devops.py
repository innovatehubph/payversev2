#!/usr/bin/env python3
"""
DevOps and Infrastructure Agents for Payverse

FORGE - DevOps Engineer Agent
SENTINEL - VPS & Network Specialist Agent
GUARDIAN - Production Deployment Expert Agent
"""

import sys
sys.path.insert(0, '/root/payverse/agents')

from core.base_agent import BaseAgent, AgentRole, AgentTask, AgentCapability


class DevOpsEngineerAgent(BaseAgent):
    """
    FORGE - DevOps Engineer Agent

    Responsibilities:
    - CI/CD pipeline management
    - Containerization (Docker/Kubernetes)
    - Automation workflows
    - Infrastructure as Code
    - Build optimization
    """

    def __init__(self):
        super().__init__(name="Forge", role=AgentRole.DEVOPS)

    def _register_capabilities(self):
        self.capabilities = [
            AgentCapability("cicd_pipelines", "Create and manage CI/CD pipelines"),
            AgentCapability("docker_containerization", "Docker containerization"),
            AgentCapability("kubernetes_orchestration", "Kubernetes deployment"),
            AgentCapability("automation", "Workflow automation"),
            AgentCapability("infrastructure_code", "Infrastructure as Code"),
            AgentCapability("build_optimization", "Optimize build processes"),
            AgentCapability("environment_management", "Manage environments"),
        ]

    def analyze(self, request: str) -> dict:
        """Analyze DevOps request."""
        analysis = {
            "request": request,
            "devops_area": "",
            "current_state": {},
            "required_actions": [],
        }

        request_lower = request.lower()

        if "docker" in request_lower or "container" in request_lower:
            analysis["devops_area"] = "containerization"
        elif "cicd" in request_lower or "pipeline" in request_lower:
            analysis["devops_area"] = "ci_cd"
        elif "kubernetes" in request_lower or "k8s" in request_lower:
            analysis["devops_area"] = "orchestration"
        elif "build" in request_lower:
            analysis["devops_area"] = "build"

        return analysis

    def execute(self, task: AgentTask) -> AgentTask:
        """Execute DevOps task."""
        self.start_task(task)

        try:
            task_lower = task.description.lower()

            if "docker" in task_lower:
                result = self.create_docker_setup()
            elif "cicd" in task_lower or "pipeline" in task_lower:
                result = self.create_cicd_pipeline()
            elif "kubernetes" in task_lower:
                result = self.create_kubernetes_config()
            else:
                result = self.analyze_devops_needs()

            return self.complete_task(task, result)

        except Exception as e:
            return self.fail_task(task, str(e))

    def create_docker_setup(self) -> dict:
        """Create Docker configuration."""
        setup = {
            "dockerfile": self._get_dockerfile(),
            "docker_compose": self._get_docker_compose(),
            "dockerignore": self._get_dockerignore(),
            "instructions": [],
        }

        setup["instructions"] = [
            "1. Save Dockerfile to project root",
            "2. Save docker-compose.yml to project root",
            "3. Create .dockerignore file",
            "4. Build: docker-compose build",
            "5. Run: docker-compose up -d",
            "6. View logs: docker-compose logs -f",
        ]

        return setup

    def _get_dockerfile(self) -> str:
        """Generate Dockerfile."""
        return '''# Payverse Production Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files and install production deps only
COPY package*.json ./
RUN npm ci --only=production

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
'''

    def _get_docker_compose(self) -> str:
        """Generate docker-compose.yml."""
        return '''version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://payverse:payverse@db:5432/payverse
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - PAYGRAM_API_TOKEN=${PAYGRAM_API_TOKEN}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - payverse-network

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=payverse
      - POSTGRES_PASSWORD=payverse
      - POSTGRES_DB=payverse
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U payverse"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - payverse-network

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped
    networks:
      - payverse-network

networks:
  payverse-network:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
'''

    def _get_dockerignore(self) -> str:
        """Generate .dockerignore."""
        return '''node_modules
npm-debug.log
.git
.gitignore
.env
.env.*
dist
*.md
.vscode
.idea
coverage
.nyc_output
'''

    def create_cicd_pipeline(self) -> dict:
        """Create CI/CD pipeline configuration."""
        pipeline = {
            "github_actions": self._get_github_actions(),
            "stages": ["test", "build", "deploy"],
            "instructions": [],
        }

        pipeline["instructions"] = [
            "1. Create .github/workflows/ directory",
            "2. Save ci.yml to .github/workflows/",
            "3. Configure secrets in GitHub repository settings",
            "4. Push to trigger pipeline",
        ]

        return pipeline

    def _get_github_actions(self) -> str:
        """Generate GitHub Actions workflow."""
        return '''name: Payverse CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: payverse_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run check

      - name: Run tests
        run: npm test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/payverse_test

  build:
    needs: test
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/

      - name: Deploy to production
        run: |
          echo "Deploy to production server"
          # Add deployment commands here
'''

    def create_kubernetes_config(self) -> dict:
        """Create Kubernetes configuration."""
        config = {
            "deployment": self._get_k8s_deployment(),
            "service": self._get_k8s_service(),
            "configmap": self._get_k8s_configmap(),
            "instructions": [],
        }

        config["instructions"] = [
            "1. Create k8s/ directory",
            "2. Save deployment.yaml, service.yaml, configmap.yaml",
            "3. Apply: kubectl apply -f k8s/",
            "4. Check: kubectl get pods -l app=payverse",
        ]

        return config

    def _get_k8s_deployment(self) -> str:
        """Generate Kubernetes deployment."""
        return '''apiVersion: apps/v1
kind: Deployment
metadata:
  name: payverse
  labels:
    app: payverse
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payverse
  template:
    metadata:
      labels:
        app: payverse
    spec:
      containers:
      - name: payverse
        image: payverse:latest
        ports:
        - containerPort: 5000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: payverse-secrets
              key: database-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 5000
          initialDelaySeconds: 5
          periodSeconds: 5
'''

    def _get_k8s_service(self) -> str:
        """Generate Kubernetes service."""
        return '''apiVersion: v1
kind: Service
metadata:
  name: payverse-service
spec:
  selector:
    app: payverse
  ports:
  - protocol: TCP
    port: 80
    targetPort: 5000
  type: LoadBalancer
'''

    def _get_k8s_configmap(self) -> str:
        """Generate Kubernetes configmap."""
        return '''apiVersion: v1
kind: ConfigMap
metadata:
  name: payverse-config
data:
  NODE_ENV: "production"
  PORT: "5000"
'''

    def analyze_devops_needs(self) -> dict:
        """Analyze project DevOps needs."""
        analysis = {
            "current_state": {
                "build_tool": "Vite",
                "package_manager": "npm",
                "containerization": "None detected",
                "ci_cd": "None detected",
            },
            "recommendations": [
                "Add Docker containerization",
                "Set up CI/CD pipeline",
                "Add health check endpoint",
                "Configure environment management",
            ],
        }

        # Check for existing configs
        dockerfile_exists = len(self.list_files(".", "Dockerfile")) > 0
        if dockerfile_exists:
            analysis["current_state"]["containerization"] = "Docker"

        return analysis


class VPSNetworkSpecialistAgent(BaseAgent):
    """
    SENTINEL - VPS & Network Specialist Agent

    Responsibilities:
    - Server configuration
    - Reverse proxy setup (Nginx/Caddy)
    - SSL/TLS management
    - Firewall configuration
    - Network security
    - DNS management
    """

    def __init__(self):
        super().__init__(name="Sentinel", role=AgentRole.VPS_SPECIALIST)

    def _register_capabilities(self):
        self.capabilities = [
            AgentCapability("server_config", "Configure VPS servers"),
            AgentCapability("reverse_proxy", "Setup reverse proxy (Nginx/Caddy)"),
            AgentCapability("ssl_tls", "Manage SSL/TLS certificates"),
            AgentCapability("firewall", "Configure firewall rules"),
            AgentCapability("network_security", "Implement network security"),
            AgentCapability("dns_management", "Manage DNS records"),
            AgentCapability("performance_tuning", "Server performance tuning"),
        ]

    def analyze(self, request: str) -> dict:
        """Analyze VPS/Network request."""
        analysis = {
            "request": request,
            "infrastructure_area": "",
            "security_considerations": [],
            "required_configurations": [],
        }

        request_lower = request.lower()

        if "nginx" in request_lower or "reverse proxy" in request_lower:
            analysis["infrastructure_area"] = "reverse_proxy"
        elif "ssl" in request_lower or "https" in request_lower or "certificate" in request_lower:
            analysis["infrastructure_area"] = "ssl_tls"
        elif "firewall" in request_lower:
            analysis["infrastructure_area"] = "firewall"
        elif "dns" in request_lower:
            analysis["infrastructure_area"] = "dns"

        return analysis

    def execute(self, task: AgentTask) -> AgentTask:
        """Execute VPS/Network task."""
        self.start_task(task)

        try:
            task_lower = task.description.lower()

            if "nginx" in task_lower:
                result = self.create_nginx_config()
            elif "ssl" in task_lower or "certificate" in task_lower:
                result = self.create_ssl_setup()
            elif "firewall" in task_lower:
                result = self.create_firewall_rules()
            elif "server" in task_lower:
                result = self.create_server_setup_guide()
            else:
                result = self.analyze_infrastructure_needs()

            return self.complete_task(task, result)

        except Exception as e:
            return self.fail_task(task, str(e))

    def create_nginx_config(self) -> dict:
        """Create Nginx reverse proxy configuration."""
        config = {
            "nginx_conf": self._get_nginx_config(),
            "instructions": [],
        }

        config["instructions"] = [
            "1. Install Nginx: sudo apt install nginx",
            "2. Save config to /etc/nginx/sites-available/payverse",
            "3. Create symlink: sudo ln -s /etc/nginx/sites-available/payverse /etc/nginx/sites-enabled/",
            "4. Test config: sudo nginx -t",
            "5. Reload Nginx: sudo systemctl reload nginx",
        ]

        return config

    def _get_nginx_config(self) -> str:
        """Generate Nginx configuration."""
        return '''# Payverse Nginx Configuration

upstream payverse_backend {
    server 127.0.0.1:5000;
    keepalive 64;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

server {
    listen 80;
    server_name payverse.example.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name payverse.example.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/payverse.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/payverse.example.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript;

    # Connection limits
    limit_conn conn_limit 20;

    # API endpoints with rate limiting
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;

        proxy_pass http://payverse_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files
    location / {
        proxy_pass http://payverse_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://payverse_backend/api/health;
    }
}
'''

    def create_ssl_setup(self) -> dict:
        """Create SSL/TLS setup guide."""
        setup = {
            "method": "Let's Encrypt with Certbot",
            "commands": [],
            "auto_renewal": "",
        }

        setup["commands"] = [
            "# Install Certbot",
            "sudo apt install certbot python3-certbot-nginx",
            "",
            "# Obtain certificate",
            "sudo certbot --nginx -d payverse.example.com",
            "",
            "# Test auto-renewal",
            "sudo certbot renew --dry-run",
        ]

        setup["auto_renewal"] = '''# Certbot auto-renewal cron (usually auto-configured)
0 0 1 * * /usr/bin/certbot renew --quiet'''

        return setup

    def create_firewall_rules(self) -> dict:
        """Create firewall configuration."""
        firewall = {
            "tool": "UFW (Uncomplicated Firewall)",
            "rules": [],
            "commands": [],
        }

        firewall["rules"] = [
            {"port": "22", "protocol": "tcp", "action": "allow", "comment": "SSH"},
            {"port": "80", "protocol": "tcp", "action": "allow", "comment": "HTTP"},
            {"port": "443", "protocol": "tcp", "action": "allow", "comment": "HTTPS"},
            {"port": "5432", "protocol": "tcp", "action": "deny", "comment": "PostgreSQL (internal only)"},
        ]

        firewall["commands"] = [
            "# Enable UFW",
            "sudo ufw enable",
            "",
            "# Allow SSH (important: do this first!)",
            "sudo ufw allow 22/tcp",
            "",
            "# Allow HTTP and HTTPS",
            "sudo ufw allow 80/tcp",
            "sudo ufw allow 443/tcp",
            "",
            "# Deny direct database access",
            "sudo ufw deny 5432/tcp",
            "",
            "# Check status",
            "sudo ufw status verbose",
        ]

        return firewall

    def create_server_setup_guide(self) -> dict:
        """Create complete server setup guide."""
        guide = {
            "os": "Ubuntu 22.04 LTS recommended",
            "steps": [],
            "security_hardening": [],
        }

        guide["steps"] = [
            {
                "step": 1,
                "title": "Initial Server Setup",
                "commands": [
                    "sudo apt update && sudo apt upgrade -y",
                    "sudo adduser payverse",
                    "sudo usermod -aG sudo payverse",
                ],
            },
            {
                "step": 2,
                "title": "Install Node.js",
                "commands": [
                    "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -",
                    "sudo apt install -y nodejs",
                ],
            },
            {
                "step": 3,
                "title": "Install PostgreSQL",
                "commands": [
                    "sudo apt install -y postgresql postgresql-contrib",
                    "sudo -u postgres createuser --interactive",
                    "sudo -u postgres createdb payverse",
                ],
            },
            {
                "step": 4,
                "title": "Install Nginx",
                "commands": [
                    "sudo apt install -y nginx",
                    "sudo systemctl enable nginx",
                ],
            },
            {
                "step": 5,
                "title": "Setup Process Manager",
                "commands": [
                    "sudo npm install -g pm2",
                    "pm2 start dist/index.js --name payverse",
                    "pm2 save",
                    "pm2 startup",
                ],
            },
        ]

        guide["security_hardening"] = [
            "Disable root SSH login",
            "Use SSH key authentication",
            "Configure fail2ban",
            "Enable automatic security updates",
            "Set up log monitoring",
        ]

        return guide

    def analyze_infrastructure_needs(self) -> dict:
        """Analyze infrastructure requirements."""
        return {
            "application_type": "Node.js web application",
            "recommended_specs": {
                "cpu": "2+ vCPUs",
                "ram": "4GB minimum, 8GB recommended",
                "storage": "50GB SSD",
                "bandwidth": "Unmetered recommended",
            },
            "required_services": [
                "Nginx (reverse proxy)",
                "PostgreSQL (database)",
                "PM2 (process manager)",
                "Certbot (SSL)",
            ],
        }


class DeploymentExpertAgent(BaseAgent):
    """
    GUARDIAN - Production Deployment Expert Agent

    Responsibilities:
    - Staging/Production environment management
    - Zero-downtime deployments
    - Monitoring and alerting
    - Incident response
    - Rollback procedures
    - Performance monitoring
    """

    def __init__(self):
        super().__init__(name="Guardian", role=AgentRole.DEPLOYMENT_EXPERT)

    def _register_capabilities(self):
        self.capabilities = [
            AgentCapability("environment_management", "Manage staging/production environments"),
            AgentCapability("zero_downtime_deploy", "Zero-downtime deployments"),
            AgentCapability("monitoring", "Setup monitoring and alerting"),
            AgentCapability("incident_response", "Handle production incidents"),
            AgentCapability("rollback", "Implement rollback procedures"),
            AgentCapability("health_checks", "Configure health checks"),
            AgentCapability("logging", "Setup centralized logging"),
        ]

    def analyze(self, request: str) -> dict:
        """Analyze deployment request."""
        analysis = {
            "request": request,
            "deployment_type": "",
            "risk_level": "medium",
            "required_checks": [],
        }

        request_lower = request.lower()

        if "deploy" in request_lower:
            analysis["deployment_type"] = "deployment"
            analysis["required_checks"] = ["tests pass", "build succeeds", "health check ready"]
        elif "rollback" in request_lower:
            analysis["deployment_type"] = "rollback"
            analysis["risk_level"] = "high"
        elif "monitor" in request_lower:
            analysis["deployment_type"] = "monitoring"

        return analysis

    def execute(self, task: AgentTask) -> AgentTask:
        """Execute deployment task."""
        self.start_task(task)

        try:
            task_lower = task.description.lower()

            if "deploy" in task_lower:
                result = self.create_deployment_procedure()
            elif "monitor" in task_lower:
                result = self.create_monitoring_setup()
            elif "rollback" in task_lower:
                result = self.create_rollback_procedure()
            else:
                result = self.create_deployment_checklist()

            return self.complete_task(task, result)

        except Exception as e:
            return self.fail_task(task, str(e))

    def create_deployment_procedure(self) -> dict:
        """Create deployment procedure."""
        procedure = {
            "type": "Zero-Downtime Deployment",
            "pre_deployment": [],
            "deployment_steps": [],
            "post_deployment": [],
            "rollback_trigger": [],
        }

        procedure["pre_deployment"] = [
            "1. Run all tests locally",
            "2. Verify build succeeds",
            "3. Review changes in staging",
            "4. Backup current database",
            "5. Notify team of deployment",
        ]

        procedure["deployment_steps"] = [
            "1. Pull latest code on production server",
            "2. Install dependencies: npm ci --production",
            "3. Run database migrations",
            "4. Build application: npm run build",
            "5. Reload PM2: pm2 reload payverse",
            "6. Verify health endpoint responds",
        ]

        procedure["post_deployment"] = [
            "1. Monitor error rates",
            "2. Check response times",
            "3. Verify critical flows work",
            "4. Update deployment log",
            "5. Notify team of completion",
        ]

        procedure["rollback_trigger"] = [
            "Error rate > 5%",
            "Response time > 5 seconds",
            "Health check fails",
            "Critical bug discovered",
        ]

        return procedure

    def create_monitoring_setup(self) -> dict:
        """Create monitoring configuration."""
        monitoring = {
            "metrics_to_track": [],
            "alerting_rules": [],
            "tools_recommended": [],
            "health_endpoint": "",
        }

        monitoring["metrics_to_track"] = [
            {"metric": "Response Time", "threshold": "< 500ms", "priority": "high"},
            {"metric": "Error Rate", "threshold": "< 1%", "priority": "critical"},
            {"metric": "CPU Usage", "threshold": "< 80%", "priority": "medium"},
            {"metric": "Memory Usage", "threshold": "< 85%", "priority": "medium"},
            {"metric": "Database Connections", "threshold": "< 90% pool", "priority": "high"},
            {"metric": "Request Count", "threshold": "baseline ± 50%", "priority": "low"},
        ]

        monitoring["alerting_rules"] = [
            {"condition": "Error rate > 5%", "action": "Page on-call", "severity": "critical"},
            {"condition": "Response time > 2s", "action": "Slack alert", "severity": "warning"},
            {"condition": "Health check fails", "action": "Page on-call", "severity": "critical"},
        ]

        monitoring["tools_recommended"] = [
            {"tool": "PM2", "purpose": "Process monitoring"},
            {"tool": "Prometheus + Grafana", "purpose": "Metrics visualization"},
            {"tool": "Sentry", "purpose": "Error tracking"},
            {"tool": "Uptime Robot", "purpose": "External health monitoring"},
        ]

        monitoring["health_endpoint"] = '''
// Add to server/routes.ts
app.get("/api/health", async (req, res) => {
  try {
    // Check database connection
    await db.execute(sql`SELECT 1`);

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});'''

        return monitoring

    def create_rollback_procedure(self) -> dict:
        """Create rollback procedure."""
        procedure = {
            "trigger_conditions": [],
            "rollback_steps": [],
            "verification": [],
            "communication": [],
        }

        procedure["trigger_conditions"] = [
            "Critical bug affecting users",
            "Error rate exceeds 5%",
            "Security vulnerability discovered",
            "Data corruption detected",
        ]

        procedure["rollback_steps"] = [
            "1. Identify the last known good version",
            "2. Stop current application: pm2 stop payverse",
            "3. Checkout previous version: git checkout <previous-tag>",
            "4. Restore database backup if needed",
            "5. Rebuild: npm ci && npm run build",
            "6. Start application: pm2 start payverse",
            "7. Verify health endpoint",
        ]

        procedure["verification"] = [
            "Health endpoint returns 200",
            "Error rate drops to normal",
            "Critical user flows work",
            "No data inconsistencies",
        ]

        procedure["communication"] = [
            "Notify engineering team immediately",
            "Update status page",
            "Prepare incident report",
            "Schedule post-mortem",
        ]

        return procedure

    def create_deployment_checklist(self) -> dict:
        """Create deployment checklist."""
        return {
            "pre_flight": [
                "[ ] All tests passing",
                "[ ] Build succeeds locally",
                "[ ] Code reviewed and approved",
                "[ ] Database migrations tested",
                "[ ] Environment variables set",
                "[ ] Rollback plan ready",
            ],
            "deployment": [
                "[ ] Notify team of deployment start",
                "[ ] Deploy to staging first",
                "[ ] Verify staging works",
                "[ ] Deploy to production",
                "[ ] Monitor for 15 minutes",
            ],
            "post_deployment": [
                "[ ] Verify health endpoint",
                "[ ] Check error monitoring",
                "[ ] Test critical flows",
                "[ ] Update deployment log",
                "[ ] Notify team of completion",
            ],
        }
