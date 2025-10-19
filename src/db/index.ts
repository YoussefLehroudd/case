import { Prisma, PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var cachedPrisma: PrismaClient
}

type PrismaClientWithRetryFlag = PrismaClient & {
  __retryMiddlewareInstalled?: boolean
}

const RETRYABLE_ERROR_CODES = new Set(['P1001', 'P1008'])
const RETRYABLE_MESSAGE_PATTERNS = [/Can't reach database server/i]
const MAX_RETRIES = Number(process.env.PRISMA_RETRY_ATTEMPTS ?? 3)
const BASE_DELAY_MS = Number(process.env.PRISMA_RETRY_DELAY_MS ?? 500)

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const isRetryablePrismaError = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_ERROR_CODES.has(error.code)
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    if (!error.errorCode) {
      return RETRYABLE_MESSAGE_PATTERNS.some((pattern) =>
        pattern.test(error.message)
      )
    }

    return RETRYABLE_ERROR_CODES.has(error.errorCode)
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return RETRYABLE_MESSAGE_PATTERNS.some((pattern) =>
      pattern.test((error as { message: string }).message)
    )
  }

  return false
}

const addRetryMiddleware = (client: PrismaClientWithRetryFlag) => {
  if (client.__retryMiddlewareInstalled) {
    return
  }

  client.__retryMiddlewareInstalled = true

  client.$use(async (params, next) => {
    let attempt = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await next(params)
      } catch (error) {
        attempt += 1

        if (!isRetryablePrismaError(error) || attempt > MAX_RETRIES) {
          throw error
        }

        const delay = BASE_DELAY_MS * attempt

        console.warn(
          `[db] Retrying Prisma operation ${params.model ?? 'unknown'}.${
            params.action
          } after error: ${(error as Error).message}. Attempt ${attempt}/${
            MAX_RETRIES
          } (waiting ${delay}ms)`
        )

        await sleep(delay)
      }
    }
  })
}

let prisma: PrismaClientWithRetryFlag
if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient()
} else {
  if (!global.cachedPrisma) {
    global.cachedPrisma = new PrismaClient()
  }

  prisma = global.cachedPrisma as PrismaClientWithRetryFlag
}

addRetryMiddleware(prisma)

export const db = prisma
