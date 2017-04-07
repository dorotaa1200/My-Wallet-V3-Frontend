angular
  .module('walletApp')
  .controller('CoinifyController', CoinifyController);

function CoinifyController ($scope, $filter, $q, MyWallet, Wallet, MyWalletHelpers, Alerts, currency, $uibModalInstance, quote, $timeout, $interval, formatTrade, buySell, $rootScope, $cookies, $window, $state, options, buyMobile) {
  $scope.settings = Wallet.settings;
  $scope.btcCurrency = $scope.settings.btcCurrency;
  $scope.currencies = currency.coinifyCurrencies;
  $scope.user = Wallet.user;
  $scope.trades = buySell.trades;
  $scope.alerts = [];
  $scope.status = {};
  this.quote = quote;

  let links = options.partners.coinify.surveyLinks;

  $scope.buySellDebug = $rootScope.buySellDebug;

  let accountIndex = MyWallet.wallet.hdwallet.defaultAccount.index;
  $scope.label = MyWallet.wallet.hdwallet.accounts[accountIndex].label;

  let exchange = buySell.getExchange();
  this.exchange = exchange && exchange.profile ? exchange : {profile: {}};

  let eventualError = (message) => Promise.reject.bind(Promise, { message });

  $scope.steps = {
    'email': 0,
    'accept-terms': 1,
    'select-payment-medium': 2,
    'summary': 3
  };

  $scope.onStep = (...steps) => steps.some(s => $scope.step === $scope.steps[s]);
  $scope.afterStep = (step) => $scope.step > $scope.steps[step];
  $scope.beforeStep = (step) => $scope.step < $scope.steps[step];
  $scope.currentStep = () => Object.keys($scope.steps).filter($scope.onStep)[0];

  this.goTo = (step) => $scope.step = $scope.steps[step];

  $scope.fields = { email: $scope.user.email };

  $scope.hideQuote = () => $scope.isMedium('bank');

  $scope.userHasExchangeAcct = this.exchange.user;

  $scope.getAccounts = () => {
    if (!this.exchange.user) { return; }

    let success = (accounts) => {
      $scope.accounts = accounts;
    };

    let accountsError = eventualError('ERROR_ACCOUNTS_FETCH');
    return $scope.mediums[$scope.medium].getAccounts().then(success, accountsError);
  };

  $scope.standardError = (err) => {
    console.log(err);
    $scope.status = {};
    try {
      let e = JSON.parse(err);
      let msg = e.error.toUpperCase();
      if (msg === 'EMAIL_ADDRESS_IN_USE') $scope.rejectedEmail = true;
      else Alerts.displayError(msg, true, $scope.alerts, {user: this.exchange.user});
    } catch (e) {
      let msg = e.error || err.message;
      if (msg) Alerts.displayError(msg, true, $scope.alerts);
      else Alerts.displayError('INVALID_REQUEST', true, $scope.alerts);
    }
  };

  $scope.updateAmounts = () => {
    $scope.transaction.methodFee = ($scope.quote.paymentMediums[$scope.medium].fee / 100).toFixed(2);
    $scope.transaction.total = ($scope.quote.paymentMediums[$scope.medium].total / 100).toFixed(2);
  };

  $scope.nextStep = () => {
    if ((!$scope.user.isEmailVerified || $scope.rejectedEmail) && !this.exchange.user) {
      this.goTo('email');
    } else if (!this.exchange.user) {
      this.goTo('accept-terms');
    } else if (!$scope.isMediumSelected) {
      this.goTo('select-payment-medium');
      $scope.isMediumSelected = true;
    } else {
      this.goTo('summary');
    }
  };

  $scope.watchAddress = () => {
    if ($rootScope.buySellDebug) {
      console.log('$scope.watchAddress() for', $scope.trade);
    }
    const success = () => $timeout(() => $scope.bitcoinReceived = true);
  };

  $scope.formatTrade = (state) => {
    if ($scope.needsKyc()) {
      let poll = buySell.pollUserLevel(buySell.kycs[0]);
      $scope.$on('$destroy', poll.cancel);
      return poll.result.then($scope.buy);
    }
  };

  $scope.onResize = (step) => $scope.isxStep = step;

  $scope.cancel = () => {
    $rootScope.$broadcast('fetchExchangeProfile');
    $uibModalInstance.dismiss('');
    buySell.getTrades().then(() => {
      $scope.goToOrderHistory();
    });
  };

  $scope.close = () => {
    let index;

    if (!this.exchange.user) index = 0;
    else if (!$scope.trades.length) index = 1;
    else index = 2;
    Alerts.surveyCloseConfirm('survey-opened', links, index).then($scope.cancel);
  };

  $scope.exitToNativeTx = () => {
    buyMobile.callMobileInterface(buyMobile.SHOW_TX, $scope.trade.txHash);
  };

  $scope.getQuoteHelper = () => {
    if ($scope.quote && !$scope.expiredQuote && $scope.beforeStep('trade-formatted')) return 'AUTO_REFRESH';
    else if ($scope.quote && !$scope.quote.id) return 'EST_QUOTE_1';
    else if ($scope.expiredQuote) return 'EST_QUOTE_2';
    else return 'RATE_WILL_EXPIRE';
  };

  $scope.goToOrderHistory = () => {
    if ($scope.onStep('accept-terms') || $scope.onStep('trade-formatted') || !$scope.trades.pending.length || $state.params.selectedTab === 'ORDER_HISTORY') {
      $uibModalInstance.dismiss('');
    } else {
      $state.go('wallet.common.buy-sell.coinify', {selectedTab: 'ORDER_HISTORY'});
    }
  };

  $scope.fakeBankTransfer = () => $scope.trade.fakeBankTransfer().then(() => {
    $scope.formatTrade('processing');
    $scope.$digest();
  });

  $scope.$watch('medium', (newVal) => newVal && $scope.getAccounts().then($scope.updateAmounts));
  $scope.$watchGroup(['exchange.user', 'paymentInfo', 'formattedTrade'], $scope.nextStep);
  $scope.$watch('user.isEmailVerified', () => $scope.onStep('email') && $scope.nextStep());
  $scope.$watch('bitcoinReceived', (newVal) => newVal && ($scope.formattedTrade = formatTrade['success']($scope.trade)));

  $scope.$watch('expiredQuote', (newVal) => {
    if (newVal && !$scope.isKYC) {
      $scope.status.gettingQuote = true;
      $scope.getQuote();
    }
  });
}
