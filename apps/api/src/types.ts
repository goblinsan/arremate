import type { User } from '@arremate/database';
import type { CognitoJwtPayload } from '@arremate/auth';

export type AppVariables = {
  currentUser: User;
  cognitoClaims: CognitoJwtPayload;
};

export type AppEnv = {
  Variables: AppVariables;
};
