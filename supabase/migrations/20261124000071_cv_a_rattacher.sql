-- Décision 8A (24/11/2026) : un CV qu'on ne sait pas rattacher à une fiche crée une alerte « CV à rattacher »
-- (rattachement en un clic dans « Cas à vérifier ») au lieu d'une fiche créée automatiquement.
alter type public.type_alerte add value if not exists 'cv_a_rattacher';
