import { exec } from "node:child_process";
import { NextResponse } from "next/server";

export async function POST() {
  const cmd =
    "pnpm tsx src/scraper/mf-scraper.ts && pnpm tsx src/scraper/crypto-scraper.ts";
  console.log(`Executing sync command: ${cmd}`);

  // Run in background
  exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Sync error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Sync stderr: ${stderr}`);
    }
    console.log(`Sync stdout: ${stdout}`);
  });

  return NextResponse.json({ message: "Sync started in background" });
}
