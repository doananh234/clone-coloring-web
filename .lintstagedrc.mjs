// eslint-disable-next-line import/no-anonymous-default-export
export default {
  '*.+(js|ts|tsx)': ['eslint --fix'],
  '*.{js,jsx,ts,tsx,json,css,scss,md,yml,yaml}': ['prettier --write'],
};
