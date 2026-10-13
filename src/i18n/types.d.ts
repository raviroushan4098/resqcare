import type en from "../messages/en.json";

// Type-checks every t("...") key against en.json.
type Messages = typeof en;
declare global {
  interface IntlMessages extends Messages {}
}
