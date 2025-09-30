import type {Config} from 'jest';
import { createDefaultPreset } from 'ts-jest';

const tsJestTransformCfg = createDefaultPreset().transform;

const config: Config = {
  transform: {
    ...tsJestTransformCfg,
  },
};

export default config;