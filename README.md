# CineZen Private Admin

Deploy this as a separate private Vercel project.

Required Vercel Environment Variable:
- TMDB_API_TOKEN = your TMDB API Read Access Token

Login with the Firebase Email/Password admin account you created.

Features:
- Search TMDB
- Publish exact movie to Firestore `latest_movies`
- Remove published movie
- Only the configured Firebase admin UID can write (Firestore Rules enforce this)

Security:
- Do not share the admin site URL/password publicly.
- Firebase web config is not a private secret; Firestore/Auth rules are the security boundary.
