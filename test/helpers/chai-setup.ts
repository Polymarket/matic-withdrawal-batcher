import chaiModule from "chai";
import { waffleChai } from "@ethereum-waffle/chai";
import chaiPromised from "chai-as-promised";

chaiModule.use(waffleChai);
chaiModule.use(chaiPromised);

export = chaiModule;
