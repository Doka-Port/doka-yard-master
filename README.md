# 🚢 Doka Yard Intelligence — Plataforma (Demo)

<p align="center">
  <img src="https://raw.githubusercontent.com/Doka-Port/doka-yard-lp/main/public/LogoWhite.svg" alt="Doka Yard Intelligence Logo" width="120" style="background:#111;border-radius:12px;padding:16px;" />
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB" />
  <img alt="Vite" src="https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white" />
  <img alt="Three.js" src="https://img.shields.io/badge/threejs-black?style=for-the-badge&logo=three.js&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" />
  <img alt="Python" src="https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/postgresql-4169e1?style=for-the-badge&logo=postgresql&logoColor=white" />
</p>

<p align="center">
  <strong>Demo oficial da plataforma Doka Yard Intelligence</strong><br/>
  Solução de inteligência operacional com visualização 3D para gestão de pátios portuários (<em>YMS</em>).
</p>

<p align="center">
  <a href="#-acesso-%C3%A0-aplica%C3%A7%C3%A3o">Deploy</a> •
  <a href="#-tecnologias">Tecnologias</a> •
  <a href="#-equipe">Equipe</a> •
  <a href="#-pré-requisitos">Pré-requisitos</a> •
  <a href="#-instalação-e-configuração">Instalação</a> •
  <a href="#-uso">Uso</a> •
  <a href="#-estrutura-do-projeto">Estrutura</a> •
  <a href="#-licença">Licença</a>
</p>

---

## 📖 Descrição

A plataforma principal da **Doka Yard Intelligence** é uma solução completa em *YMS (Yard Management System)*, focada em fornecer visibilidade espacial e analítica das operações portuárias em tempo real.\n\nEste repositório (**doka-yard-master**) contém a demonstração oficial (demo) da aplicação, dividida em um back-end robusto focado em otimização de infraestrutura e um front-end imersivo com renderização gráfica tridimensional.

### Funcionalidades do Demo

- **Integração 3D (R3F)** — Representação espacial e interativa do pátio com o ambiente portuário
- **Otimizações Operacionais** — Cálculos e análise de otimização no deslocamento de containers
- **Ambiente Full Stack Integrado** — APIs RESTful providas por FastAPI e um banco de dados relacional sólido (PostgreSQL)
- **Gestão em Tempo Real** — Controles interativos para os itens no pátio com integração de UI (`leva`) e visualização fluida.

---

## 🛠 Tecnologias

### Front-end (`frontend-3d`)
| Categoria        | Tecnologia                                              |
| ---------------- | ------------------------------------------------------- |
| **Framework**    | [React](https://react.dev/) 19                          |
| **Build Tool**   | [Vite](https://vitejs.dev/) 8                           |
| **Renderização 3D** | [Three.js](https://threejs.org/) & [React Three Fiber](https://r3f.docs.pmnd.rs/) |
| **Utilitários 3D** | [@react-three/drei](https://github.com/pmndrs/drei)   |
| **Ícones / UI**  | [Lucide React](https://lucide.dev/), [Leva](https://github.com/pmndrs/leva) |
| **Linguagem**    | TypeScript                                              |

### Back-end (`backend`)
| Categoria        | Tecnologia                                              |
| ---------------- | ------------------------------------------------------- |
| **Framework Web**| [FastAPI](https://fastapi.tiangolo.com/)                |
| **Servidor**     | [Uvicorn](https://www.uvicorn.org/)                     |
| **Banco de Dados**| [PostgreSQL](https://www.postgresql.org/) (via Docker)  |
| **ORM / Migrations**| [SQLAlchemy](https://www.sqlalchemy.org/) (Async) & [Alembic](https://alembic.sqlalchemy.org/)|
| **Linguagem**    | Python 3                                                |

---

## 👥 Equipe

A mesma equipe responsável por arquitetar a Landing Page e toda a estrutura de negócio da Doka:

| Nome                        | Papel       |
| --------------------------- | ----------- |
| **Murilo Bauck**            | Membro      |
| **Victor de Toledo**        | Membro      |
| **Jônatas Gandra**          | Membro      |
| **Leonardo Arruma Ferreira**| Membro      |

---

## ✅ Pré-requisitos

Certifique-se de ter as seguintes ferramentas instaladas:

- [**Node.js**](https://nodejs.org/) >= 18.x
- [**npm**](https://www.npmjs.com/) ou [**pnpm**](https://pnpm.io/)
- [**Python**](https://www.python.org/) >= 3.10
- [**Docker** & **Docker Compose**](https://www.docker.com/) (Para o banco de dados)

---

## 🚀 Instalação e Configuração

1. **Clone o repositório**

   ```bash
   git clone https://github.com/Doka-Port/doka-yard-master.git
   cd doka-yard-master
   ```

2. **Suba o Banco de Dados (Docker)**

   ```bash
   docker-compose up -d
   ```

3. **Configuração do Back-end**

   Copie as variáveis de ambiente base:
   ```bash
   cp .env.example .env
   ```
   *Certifique-se de conferir os dados de conexão do PostgreSQL no arquivo `.env` para corresponder ao docker-compose.*

   Crie um ambiente virtual e instale as dependências:
   ```bash
   python -m venv venv
   # No Windows (PowerShell/CMD) use: venv\Scripts\activate
   # No Linux/Mac: source venv/bin/activate

   pip install -r requirements.txt
   ```

   Crie as tabelas no banco de dados através das migrações do Alembic (se configurado) ou execute o script da aplicação:
   ```bash
   # (Dentro da pasta do projeto, seguindo as diretrizes de inicialização no main.py)
   ```

4. **Configuração do Front-end (3D)**

   ```bash
   cd frontend-3d
   npm install
   ```

---

## 💻 Uso

A aplicação necessita do Front-end e Back-end rodando de forma combinada para integração perfeita.

### Back-end (API)

A partir da raiz do repositório, com o ambiente virtual ativado:

```bash
cd backend
uvicorn main:app --reload
```
A API estará disponível em **http://localhost:8000** (Documentação no **http://localhost:8000/docs**).

### Front-end (Aplicação 3D)

Abra outro terminal, e navegue à pasta do frontend:

```bash
cd frontend-3d
npm run dev
```

A aplicação estará disponível em **http://localhost:5173** (porta padrão do Vite).

---

## 📁 Estrutura do Projeto

```
doka-yard-master/
├── backend/                 # API RESTful, Modelos e Lógica de Negócios
│   ├── models/              # Modelos de banco de dados (SQLAlchemy)
│   ├── routers/             # Rotas / Endpoints do FastAPI
│   ├── services/            # Serviços com as regras de negócios da operação
│   ├── config.py            # Configurações do ambiente
│   ├── database.py          # Gerenciamento de conexão com o PostgreSQL
│   └── main.py              # Ponto de entrada do FastAPI
├── frontend-3d/             # Interface visual do YMS
│   ├── index.html           # HTML template
│   ├── package.json         # Dependências do frontend
│   └── src/                 # Componentes React e Three.js
├── scripts/                 # Scripts diversos de infra/automação
├── tests/                   # Rotinas de testes da aplicação
├── docker-compose.yml       # Orquestração do PostgreSQL (Container)
├── requirements.txt         # Dependências do Back-end de Python
└── README.md                # Este arquivo
```

---

## 📄 Licença

Este projeto está licenciado sob a **MIT License**.

```
MIT License

Copyright (c) 2025 Doka Yard Intelligence

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
