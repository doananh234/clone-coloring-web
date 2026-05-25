export type LoginCredentials = {
  email: string;
  password: string;
};

export type RegisterData = {
  email: string;
  password: string;
  name: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};
