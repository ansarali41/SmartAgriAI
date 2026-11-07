-- Per-user Disease AI engine: local model, Google Gemini or Groq.
CREATE TYPE "AiProvider" AS ENUM ('LOCAL', 'GEMINI', 'GROQ');

CREATE TABLE "AiSettings" (
    "userId" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'LOCAL',
    "geminiKeySealed" TEXT,
    "geminiModel" TEXT,
    "groqKeySealed" TEXT,
    "groqModel" TEXT,
    "fallbackToLocal" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
