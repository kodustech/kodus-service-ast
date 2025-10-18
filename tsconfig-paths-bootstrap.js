import { compilerOptions } from './tsconfig.json';
import { register } from 'tsconfig-paths';

const paths = compilerOptions.paths;

register({
    baseUrl: compilerOptions.baseUrl,
    paths,
});
