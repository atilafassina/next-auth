import emailSignin from "../email/signin.js"
import { SignInError } from "../../errors.js"
import { getAuthorizationUrl } from "../oauth/authorization-url.js"
import { getAdapterUserFromEmail, handleAuthorized } from "./shared.js"

import type {
  Account,
  InternalOptions,
  RequestInternal,
  ResponseInternal,
} from "../../types.js"

/**
 * Initiates the sign in process for OAuth and Email flows .
 * For OAuth, redirects to the provider's authorization URL.
 * For Email, sends an email with a sign in link.
 */
export async function signin(
  query: RequestInternal["query"],
  body: RequestInternal["body"],
  options: InternalOptions<"oauth" | "email">
): Promise<ResponseInternal> {
  const { url, logger, provider } = options
  try {
    if (provider.type === "oauth" || provider.type === "oidc") {
      return await getAuthorizationUrl(query, options)
    } else if (provider.type === "email") {
      const normalizer = provider.normalizeIdentifier ?? defaultNormalizer
      const email = normalizer(body?.email)

      // @ts-expect-error -- Verified in `assertConfig`
      const user = await getAdapterUserFromEmail(email, options.adapter)

      const account: Account = {
        providerAccountId: email,
        userId: user.id,
        type: "email",
        provider: provider.id,
      }

      const unauthorizedOrError = await handleAuthorized(
        { user, account, email: { verificationRequest: true } },
        options
      )

      if (unauthorizedOrError) return unauthorizedOrError

      const redirect = await emailSignin(email, options)
      return { redirect }
    }
    return { redirect: `${url}/signin` }
  } catch (e) {
    const error = new SignInError(e as Error, { provider: provider.id })
    logger.error(error)
    url.searchParams.set("error", error.name)
    url.pathname += "/error"
    return { redirect: url }
  }
}

function defaultNormalizer(email?: string) {
  if (!email) throw new Error("Missing email from request body.")
  // Get the first two elements only,
  // separated by `@` from user input.
  let [local, domain] = email.toLowerCase().trim().split("@")
  // The part before "@" can contain a ","
  // but we remove it on the domain part
  domain = domain.split(",")[0]
  return `${local}@${domain}`
}
