# Система управления энергоаудитом

Self-hosted веб-приложение для управления процессом энергетического обследования зданий и сооружений.

## Возможности

- **Оператор** — создаёт заявки, вносит данные клиентов и объектов обследования
- **Инженер** — работает с планшета на объекте, вводит метрики, отправляет результаты
- **Администратор** — управляет пользователями системы
- **Генерация Word-отчётов** — формируются по кнопке, не хранятся на сервере
- **Блокировка данных** — после отправки обследование нельзя изменить или удалить
- **Конкурентная работа** — несколько инженеров на одну заявку без конфликтов

## Стек

| Компонент | Технология |
|-----------|-----------|
| Backend | Python 3.12, FastAPI, SQLAlchemy (async), asyncpg |
| База данных | PostgreSQL 16 |
| Frontend | Vanilla JS (SPA), CSS Grid |
| Отчёты | python-docx (генерация в памяти) |
| Авторизация | JWT + bcrypt |
| Развёртывание | Docker Compose |

## Быстрый старт

```bash
# Клонировать репозиторий
git clone <repo-url>
cd energy-audit-engineer-etl

# Скопировать и настроить переменные окружения
cp .env.example .env

# Запустить
docker-compose up --build
```

Приложение доступно по адресу **http://localhost:8000**

Логин по умолчанию: `admin` / `admin`

## Первые шаги после запуска

1. Войти как `admin`
2. Создать пользователей: оператора и инженеров (вкладка «Пользователи»)
3. Войти как оператор — создать клиента, объект, заявку
4. Войти как инженер — открыть заявку, заполнить метрики, отправить
5. Скачать Word-отчёт

## Структура проекта

```
energy-audit-engineer-etl/
├── backend/
│   ├── app/
│   │   ├── api/routes/            # Маршруты API (auth, clients, objects, applications, inspections, reports)
│   │   ├── core/                  # Конфигурация и безопасность (JWT, bcrypt)
│   │   ├── db/                    # Подключение к БД (async engine, session)
│   │   ├── models/models.py       # ORM-модели (User, Client, AuditObject, Application, Inspection)
│   │   ├── schemas/schemas.py     # Pydantic-схемы запросов/ответов
│   │   ├── services/              # Генератор Word-отчётов
│   │   └── main.py                # Точка входа FastAPI
│   ├── static/                    # Фронтенд (HTML + CSS + JS)
│   ├── Dockerfile
│   └── requirements.txt
├── scripts/
│   ├── ddl.sql                    # Схема БД + seed-пользователь admin
│   └── generate_reference_doc.py  # Генерация справочного Word-документа
├── docs/
│   └── reference.docx             # Справочник: роли, статусы, типы, метрики (рус.)
├── docker-compose.yml
├── .env.example
└── CLAUDE.md                      # Контекст проекта для AI-ассистента
```

## Схема базы данных

```
clients 1──* audit_objects 1──1 applications *──1 users (operator)
                                    │
                                    1
                                    │
                                    *
                              inspections *──1 users (engineer)
```

| Таблица | Назначение |
|---------|-----------|
| `users` | Пользователи (роли: operator, engineer, admin) |
| `clients` | Клиенты (заказчики обследования) |
| `audit_objects` | Объекты обследования (здания, сооружения) |
| `applications` | Заявки на обследование |
| `inspections` | Результаты обследований (метрики) |

## Бизнес-процесс

```
Оператор                    Инженер(ы)                    Система
────────                    ──────────                    ───────
Создаёт клиента
Создаёт объект
Создаёт заявку ──────────► Видит заявку (status: new)
                            Берёт в работу ──────────────► status: in_progress
                            Заполняет метрики
                            Сохраняет черновик
                            ...
                            Нажимает «Отправить» ────────► Данные заблокированы
                            (все инженеры отправили) ────► status: inspection_done
Нажимает «Скачать отчёт» ──────────────────────────────► Генерация .docx
                                                          status: report_generated
Закрывает заявку ──────────────────────────────────────► status: closed
```

## API

Документация Swagger доступна после запуска: **http://localhost:8000/api/docs**

### Основные эндпоинты

| Метод | Путь | Роли | Описание |
|-------|------|------|----------|
| POST | `/api/v1/auth/login` | все | Авторизация (JWT) |
| GET | `/api/v1/auth/me` | все | Текущий пользователь |
| POST | `/api/v1/auth/users` | admin | Создать пользователя |
| POST | `/api/v1/clients` | operator | Создать клиента |
| GET | `/api/v1/clients` | operator | Список клиентов |
| POST | `/api/v1/objects` | operator | Создать объект |
| POST | `/api/v1/applications` | operator | Создать заявку |
| GET | `/api/v1/applications` | все | Список заявок |
| GET | `/api/v1/applications/{id}` | все | Детали заявки |
| POST | `/api/v1/inspections` | engineer | Создать обследование |
| PUT | `/api/v1/inspections/{id}` | engineer | Обновить (только черновик) |
| POST | `/api/v1/inspections/{id}/submit` | engineer | Отправить (заблокировать) |
| DELETE | `/api/v1/inspections/{id}` | engineer | Удалить (только черновик) |
| GET | `/api/v1/reports/{id}/download` | все | Скачать Word-отчёт |

## Метрики обследования

Инженер заполняет при осмотре объекта:

| Метрика | Единица | Поле в БД |
|---------|---------|-----------|
| Потребление тепла | Гкал | `heating_consumption` |
| Потребление электроэнергии | кВт·ч | `electricity_consumption` |
| Потребление воды | м³ | `water_consumption` |
| Потребление газа | м³ | `gas_consumption` |
| Толщина стен | мм | `wall_thickness_mm` |
| Тип окон | — | `window_type` |
| Тип утепления | — | `insulation_type` |
| Термическое сопротивление | м²·°C/Вт | `thermal_resistance` |
| Воздухопроницаемость | м³/(ч·м²) | `air_tightness` |
| Температура внутри | °C | `indoor_temperature` |
| Температура снаружи | °C | `outdoor_temperature` |

Дополнительные метрики можно хранить в JSONB-поле `extra_metrics` без изменения схемы БД.

## Расширяемость

- **Новые метрики** — через JSONB `extra_metrics` или добавлением колонок
- **Новые типы услуг** — поле `service_type` принимает произвольные строки
- **Новые параметры объектов** — через JSONB `extra_params`
- **Новые шаблоны отчётов** — добавляются в `backend/app/services/`

## Справочная документация

Полная расшифровка всех типов, статусов, ролей и метрик на русском языке:

- **Word**: `docs/reference.docx`
- **Перегенерация**: `python scripts/generate_reference_doc.py`

## Конфигурация

Переменные окружения (префикс `APP_`):

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `APP_POSTGRES_HOST` | `localhost` | Хост PostgreSQL |
| `APP_POSTGRES_PORT` | `5432` | Порт PostgreSQL |
| `APP_POSTGRES_USER` | `energy_audit` | Пользователь БД |
| `APP_POSTGRES_PASSWORD` | `energy_audit_secret` | Пароль БД |
| `APP_POSTGRES_DB` | `energy_audit` | Имя базы данных |
| `APP_SECRET_KEY` | — | Секретный ключ для JWT (обязательно сменить) |
| `APP_ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Время жизни токена (8 часов) |

## Лицензия

Проприетарное ПО. Все права защищены.
