# ATS Unitech Solution

Outil interne de suivi et de matching des consultants.

- Brief de référence : `BRIEF.md` — règles du projet : `CLAUDE.md` — avancement : `SUIVI.md`
- Préparation des comptes : `GUIDE_PREPARATION.md`

## Commandes (pour un développeur)
| Commande | Rôle |
|---|---|
| `npm run dev` | lance l'application en local |
| `npm test` | tests automatiques (règles métier + base de données temporaire) |
| `npm run typecheck` / `npm run lint` | vérifications du code |
| `npm run build` | construit l'application (comme Vercel) |

Base de données : migrations SQL dans `supabase/migrations/` (appliquées dans l'ordre).
Les tests de base utilisent un Postgres local temporaire (`scripts/db-locale.sh`, Postgres 16 + pgvector).
