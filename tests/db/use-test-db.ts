import 'dotenv/config';
import { pointToTestDatabase } from './safety';

// Cada worker do `test:db` aponta para o banco de testes antes de qualquer conexão (ADR-0024).
pointToTestDatabase();
