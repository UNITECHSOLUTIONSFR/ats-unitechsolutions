import { NextResponse, type NextRequest } from "next/server";

/** Juste après la connexion : le passage par /auth/ remet à zéro le compteur d'inactivité (voir proxy), puis accueil. */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}
