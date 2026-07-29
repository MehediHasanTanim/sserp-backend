import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';

async function main() {
  const check = process.argv.includes('--check');
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = new DocumentBuilder()
    .setTitle('SSERP API')
    .setDescription('Special School & Therapy Center ERP')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const outPath = join(__dirname, '..', 'openapi', 'openapi.json');
  const json = JSON.stringify(document, null, 2);
  if (check) {
    if (!existsSync(outPath)) {
      throw new Error('openapi/openapi.json missing — run npm run openapi:export');
    }
    const existing = readFileSync(outPath, 'utf8');
    if (existing !== json) {
      throw new Error('openapi/openapi.json is stale — run npm run openapi:export');
    }
    // eslint-disable-next-line no-console
    console.log('OpenAPI document is up to date');
  } else {
    writeFileSync(outPath, json);
    // eslint-disable-next-line no-console
    console.log(`Wrote ${outPath}`);
  }
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
