# DER do Stockinho

O diagrama representa o banco utilizado pelo sistema. As tabelas `auth.users` e as funções de autenticação pertencem ao Supabase; as tabelas `sk_*` são criadas por `schema.sql`.

```mermaid
erDiagram
    AUTH_USERS ||--o{ SK_MEMBERSHIPS : participa
    SK_COMPANIES ||--o{ SK_MEMBERSHIPS : possui
    SK_COMPANIES ||--o{ SK_LOCATIONS : possui
    SK_COMPANIES ||--o{ SK_CATEGORIES : organiza
    SK_CATEGORIES ||--o{ SK_PRODUCTS : classifica
    SK_COMPANIES ||--o{ SK_PRODUCTS : cataloga
    SK_PRODUCTS ||--o{ SK_BALANCES : possui
    SK_LOCATIONS ||--o{ SK_BALANCES : armazena
    SK_PRODUCTS ||--o{ SK_MOVEMENTS : movimenta
    SK_LOCATIONS ||--o{ SK_MOVEMENTS : registra
    SK_COMPANIES ||--o{ SK_MOVEMENTS : audita
    AUTH_USERS ||--o{ SK_MOVEMENTS : cria

    AUTH_USERS {
        uuid id PK
        text email
        timestamptz email_confirmed_at
    }
    SK_COMPANIES {
        uuid id PK
        text name
        timestamptz created_at
    }
    SK_MEMBERSHIPS {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        text role
    }
    SK_LOCATIONS {
        uuid id PK
        uuid tenant_id FK
        text name
        text type
        text address
    }
    SK_CATEGORIES {
        uuid id PK
        uuid tenant_id FK
        text name
        text color
    }
    SK_PRODUCTS {
        uuid id PK
        uuid tenant_id FK
        uuid category_id FK
        text name
        text barcode
        numeric cost_price
        numeric sale_price
        numeric min_quantity
        boolean active
    }
    SK_BALANCES {
        uuid id PK
        uuid tenant_id FK
        uuid product_id FK
        uuid location_id FK
        numeric quantity
    }
    SK_MOVEMENTS {
        uuid id PK
        uuid tenant_id FK
        uuid product_id FK
        uuid location_id FK
        uuid created_by FK
        text type
        numeric quantity
        text reason
        text note
        timestamptz created_at
    }
```

As chaves estrangeiras compostas `(tenant_id, category_id)`, `(tenant_id, product_id)` e `(tenant_id, location_id)` impedem relações entre empresas diferentes. A RLS usa a associação em `sk_memberships`; `admin` gerencia cadastros e `operator` consulta e registra movimentações.
