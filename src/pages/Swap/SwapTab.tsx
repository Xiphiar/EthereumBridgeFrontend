import React from 'react';
import { Button, Container } from 'semantic-ui-react';
import preloadedTokens from './tokens.json';
import './override.css';
import {
  fromToNumberFormat,
  beliefPriceNumberFormat,
  mulDecimals,
  sleep,
} from 'utils';
import { SwapAssetRow } from './SwapAssetRow';
import { AdditionalInfo } from './AdditionalInfo';
import { PriceAndSlippage } from './PriceAndSlippage';
import {
  compute_swap,
  compute_offer_amount,
  reverse_decimal,
} from '../../blockchain-bridge/scrt/swap';
import { SigningCosmWasmClient } from 'secretjs';
import { UserStoreEx } from 'stores/UserStore';
import { observable } from 'mobx';
import { SwapTabsHeader } from './TabsHeader';
import { ERROR_WRONG_VIEWING_KEY, getBalance, Pair, TokenDisplay } from '.';

const flexRowSpace = <span style={{ flex: 1 }}></span>;

const downArrow = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#00ADE8"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <polyline points="19 12 12 19 5 12"></polyline>
  </svg>
);

const BUTTON_MSG_ENTER_AMOUNT = 'Enter an amount';
const BUTTON_MSG_NO_TRADNIG_PAIR = 'Trading pair does not exist';
const BUTTON_MSG_LOADING_PRICE = 'Loading price data';
const BUTTON_MSG_NOT_ENOUGH_LIQUIDITY = 'Insufficient liquidity for this trade';
const BUTTON_MSG_SWAP = 'Swap';

export class SwapTab extends React.Component<
  Readonly<{ user: UserStoreEx; containerStyle: any }>,
  {
    fromToken: string;
    toToken: string;
    tokens: {
      [symbol: string]: TokenDisplay;
    };
    balances: {
      [symbol: string]: number | JSX.Element;
    };
    pairs: Array<Pair>;
    pairFromSymbol: {
      [symbol: string]: Pair;
    };
    fromInput: string;
    toInput: string;
    isFromEstimated: boolean;
    isToEstimated: boolean;
    spread: number;
    commission: number;
    priceImpact: number;
    slippageTolerance: number;
    buttonMessage: string;
    loadingSwap: boolean;
  }
> {
  constructor(props: Readonly<{ user: UserStoreEx; containerStyle: any }>) {
    super(props);
    this.user = props.user;
  }

  @observable private user: UserStoreEx;
  private secretjs: SigningCosmWasmClient;
  private ws: WebSocket;
  public state = {
    pairs: [],
    pairFromSymbol: {},
    tokens: {},
    fromToken: '',
    toToken: '',
    balances: {},
    fromInput: '',
    toInput: '',
    isFromEstimated: false,
    isToEstimated: false,
    spread: 0,
    commission: 0,
    priceImpact: 0,
    slippageTolerance: 0.005,
    buttonMessage: BUTTON_MSG_ENTER_AMOUNT,
    loadingSwap: false,
  };
  private symbolUpdateHeightCache: { [symbol: string]: number } = {};

  async componentDidMount() {
    await this.user.signIn();

    while (!this.user.secretjs) {
      await sleep(100);
    }

    this.secretjs = this.user.secretjs;

    const {
      pairs,
    }: {
      pairs: Array<Pair>;
    } = await this.secretjs.queryContractSmart(
      process.env.AMM_FACTORY_CONTRACT,
      {
        pairs: {},
      },
    );

    const pairFromSymbol = {};

    const tokens: {
      [symbol: string]: TokenDisplay;
    } = await pairs.reduce(
      async (
        tokensFromPairs: Promise<{
          [symbol: string]: TokenDisplay;
        }>,
        pair: Pair,
      ) => {
        let unwrapedTokensFromPairs: {
          [symbol: string]: TokenDisplay;
        } = await tokensFromPairs; // reduce with async/await

        const symbols = [];
        for (const t of pair.asset_infos) {
          if ('native_token' in t) {
            unwrapedTokensFromPairs['SCRT'] = preloadedTokens['SCRT'];
            symbols.push('SCRT');
            continue;
          }

          const tokenInfoResponse = await this.secretjs.queryContractSmart(
            t.token.contract_addr,
            {
              token_info: {},
            },
          );

          const symbol = tokenInfoResponse.token_info.symbol;

          if (!(symbol in unwrapedTokensFromPairs)) {
            unwrapedTokensFromPairs[symbol] = {
              symbol: symbol,
              decimals: tokenInfoResponse.token_info.decimals,
              logo: preloadedTokens[symbol]
                ? preloadedTokens[symbol].logo
                : '/unknown.png',
              address: t.token.contract_addr,
              token_code_hash: t.token.token_code_hash,
            };
          }
          symbols.push(symbol);
        }
        pairFromSymbol[`${symbols[0]}/${symbols[1]}`] = pair;
        pairFromSymbol[`${symbols[1]}/${symbols[0]}`] = pair;

        return unwrapedTokensFromPairs;
      },
      Promise.resolve({}) /* reduce with async/await */,
    );

    const fromToken = Object.keys(tokens)[1];
    const toToken = Object.keys(tokens)[0];

    this.user.websocketTerminate(true);

    this.ws = new WebSocket(process.env.SECRET_WS);

    this.ws.onmessage = async event => {
      try {
        const data = JSON.parse(event.data);

        const symbols: Array<string> = data.id.split('/');

        const heightFromEvent =
          data?.result?.data?.value?.TxResult?.height ||
          data?.result?.data?.value?.block?.header?.height ||
          0;
        const height = Number(heightFromEvent);

        if (isNaN(height)) {
          console.error(
            `height is NaN for some reason. Unexpected behavior from here on out: got heightFromEvent=${heightFromEvent}`,
          );
        }

        console.log(`Refreshing ${symbols.join(' and ')} for height ${height}`);

        for (const tokenSymbol of symbols) {
          if (height <= this.symbolUpdateHeightCache[tokenSymbol]) {
            console.log(`${tokenSymbol} already fresh for height ${height}`);
            return;
          }
          this.symbolUpdateHeightCache[tokenSymbol] = height;

          let viewingKey: string;
          if (tokenSymbol !== 'SCRT') {
            const currentBalance: string = JSON.stringify(
              this.state.balances[tokenSymbol],
            );

            if (
              typeof currentBalance === 'string' &&
              currentBalance.includes(ERROR_WRONG_VIEWING_KEY)
            ) {
              // In case this tx was set_viewing_key in order to correct the wrong viewing key error
              // Allow Keplr time to locally save the new viewing key
              await sleep(1000);
            }

            // Retry getSecret20ViewingKey 3 times
            // Sometimes this event is fired before Keplr stores the viewing key
            let tries = 0;
            while (true) {
              tries += 1;
              try {
                viewingKey = await this.user.keplrWallet.getSecret20ViewingKey(
                  this.user.chainId,
                  tokens[tokenSymbol].address,
                );
              } catch (error) {}
              if (viewingKey || tries === 3) {
                break;
              }
              await sleep(100);
            }
          }

          const userBalancePromise = getBalance(
            tokenSymbol,
            this.user.address,
            tokens,
            viewingKey,
            this.user,
            this.secretjs,
          );

          const pairsSymbols = Object.keys(pairFromSymbol).filter(pairSymbol =>
            pairSymbol.startsWith(`${tokenSymbol}/`),
          );
          const pairsBalancesPromises = pairsSymbols.map(pairSymbol =>
            getBalance(
              tokenSymbol,
              pairFromSymbol[pairSymbol].contract_addr,
              tokens,
              'SecretSwap',
              this.user,
              this.secretjs,
            ),
          );

          const freshBalances = await Promise.all(
            [userBalancePromise].concat(pairsBalancesPromises),
          );

          const pairSymbolToFreshBalances: {
            [symbol: string]: number | JSX.Element;
          } = {};
          for (let i = 0; i < pairsSymbols.length; i++) {
            const pairSymbol = pairsSymbols[i];
            const [a, b] = pairSymbol.split('/');
            const invertedPairSymbol = `${b}/${a}`;

            pairSymbolToFreshBalances[`${tokenSymbol}-${pairSymbol}`] =
              freshBalances[i + 1];
            pairSymbolToFreshBalances[`${tokenSymbol}-${invertedPairSymbol}`] =
              freshBalances[i + 1];
          }

          // Using a callbak to setState prevents a race condition
          // where two tokens gets updated after the same block
          // and they start this update with the same this.state.balances
          // (Atomic setState)
          this.setState(
            currentState => {
              return {
                balances: Object.assign(
                  {},
                  currentState.balances,
                  {
                    [tokenSymbol]: freshBalances[0],
                  },
                  pairSymbolToFreshBalances,
                ),
              };
            },
            () => this.updateInputs(),
          );
        }
      } catch (error) {
        console.log(error);
      }
    };

    this.ws.onopen = async () => {
      // Here we register for token related events
      // Then in onmessage we know when to refresh all the balances
      while (!this.user.address) {
        await sleep(100);
      }

      // Register for token or SCRT events
      for (const symbol of Object.keys(tokens)) {
        if (symbol === 'SCRT') {
          const myAddress = this.user.address;
          const scrtQueries = [
            `message.sender='${myAddress}'` /* sent a tx (gas) */,
            `message.signer='${myAddress}'` /* executed a contract (gas) */,
            `transfer.recipient='${myAddress}'` /* received SCRT */,
          ];

          for (const query of scrtQueries) {
            this.ws.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: 'SCRT', // jsonrpc id
                method: 'subscribe',
                params: { query },
              }),
            );
          }
        } else {
          // Any tx on the token's contract
          const tokenAddress = tokens[symbol].address;
          const tokenQueries = [
            `message.contract_address='${tokenAddress}'`,
            `wasm.contract_address='${tokenAddress}'`,
          ];

          for (const query of tokenQueries) {
            this.ws.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: symbol, // jsonrpc id
                method: 'subscribe',
                params: { query },
              }),
            );
          }
        }
      }

      // Register for pair events
      // Token events aren't enough because of a bug in x/compute (x/wasmd)
      // See: https://github.com/CosmWasm/wasmd/pull/386
      const uniquePairSymbols: Array<string> = Object.values(
        Object.keys(pairFromSymbol).reduce((symbolFromPair, symbol) => {
          const pair = JSON.stringify(pairFromSymbol[symbol]);
          if (pair in symbolFromPair) {
            return symbolFromPair;
          }

          return Object.assign(symbolFromPair, {
            [pair]: symbol,
          });
        }, {}),
      );

      for (const symbol of uniquePairSymbols) {
        const pairAddress = pairFromSymbol[symbol].contract_addr;

        const pairQueries = [
          `message.contract_address='${pairAddress}'`,
          `wasm.contract_address='${pairAddress}'`,
        ];

        for (const query of pairQueries) {
          this.ws.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: symbol, // jsonrpc id
              method: 'subscribe',
              params: { query },
            }),
          );
        }
      }
    };

    this.setState({
      pairs,
      pairFromSymbol,
      tokens,
      fromToken,
      toToken,
    });
  }

  async componentWillUnmount() {
    this.user.websocketInit();

    if (this.ws) {
      while (this.ws.readyState === WebSocket.CONNECTING) {
        await sleep(100);
      }

      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000 /* Normal Closure */, 'See ya');
      }
    }
  }

  async updateInputs() {
    const selectedPairSymbol = `${this.state.fromToken}/${this.state.toToken}`;

    const offer_pool = Number(
      this.state.balances[`${this.state.fromToken}-${selectedPairSymbol}`],
    );
    const ask_pool = Number(
      this.state.balances[`${this.state.toToken}-${selectedPairSymbol}`],
    );

    if (isNaN(offer_pool) || isNaN(ask_pool)) {
      return;
    }

    if (this.state.isToEstimated) {
      const offer_amount = Number(this.state.fromInput);

      const { return_amount, spread_amount, commission_amount } = compute_swap(
        offer_pool,
        ask_pool,
        offer_amount,
      );

      if (isNaN(return_amount) || this.state.fromInput === '') {
        this.setState({
          isFromEstimated: false,
          toInput: '',
          isToEstimated: false,
          spread: 0,
          commission: 0,
          priceImpact: 0,
        });
      } else {
        this.setState({
          toInput:
            return_amount < 0 ? '' : fromToNumberFormat.format(return_amount),
          isToEstimated: true,
          spread: spread_amount,
          commission: commission_amount,
          priceImpact: spread_amount / return_amount,
        });
      }
    } else if (this.state.isFromEstimated) {
      const ask_amount = Number(this.state.toInput);

      const {
        offer_amount,
        spread_amount,
        commission_amount,
      } = compute_offer_amount(offer_pool, ask_pool, ask_amount);

      if (isNaN(offer_amount) || this.state.toInput === '') {
        this.setState({
          isToEstimated: false,
          fromInput: '',
          isFromEstimated: false,
          spread: 0,
          commission: 0,
          priceImpact: 0,
        });
      } else {
        this.setState({
          isToEstimated: false,
          fromInput:
            offer_amount < 0 ? '' : fromToNumberFormat.format(offer_amount),
          isFromEstimated: offer_amount >= 0,
          spread: spread_amount,
          commission: commission_amount,
          priceImpact: spread_amount / offer_amount,
        });
      }
    }
  }

  render() {
    const selectedPairSymbol = `${this.state.fromToken}/${this.state.toToken}`;
    const pair = this.state.pairFromSymbol[selectedPairSymbol];

    let buttonMessage: string;
    if (this.state.fromInput === '' && this.state.toInput === '') {
      buttonMessage = BUTTON_MSG_ENTER_AMOUNT;
    } else if (
      Number(this.state.balances[this.state.fromToken]) <
      Number(this.state.fromInput)
    ) {
      buttonMessage = `Insufficient ${this.state.fromToken} balance`;
    } else if (!pair) {
      buttonMessage = BUTTON_MSG_NO_TRADNIG_PAIR;
    } else if (this.state.fromInput === '' || this.state.toInput === '') {
      buttonMessage = BUTTON_MSG_LOADING_PRICE;
    } else if (this.state.priceImpact >= 1 || this.state.priceImpact < 0) {
      buttonMessage = BUTTON_MSG_NOT_ENOUGH_LIQUIDITY;
    } else {
      buttonMessage = BUTTON_MSG_SWAP;
    }

    const hidePriceRow: boolean =
      this.state.toInput === '' ||
      this.state.fromInput === '' ||
      isNaN(Number(this.state.toInput) / Number(this.state.fromInput)) ||
      this.state.buttonMessage === BUTTON_MSG_NOT_ENOUGH_LIQUIDITY ||
      this.state.buttonMessage === BUTTON_MSG_NO_TRADNIG_PAIR;

    const [fromBalance, toBalance] = [
      this.state.balances[this.state.fromToken],
      this.state.balances[this.state.toToken],
    ];

    return (
      <>
        <Container style={this.props.containerStyle}>
          <SwapTabsHeader />
          <SwapAssetRow
            isFrom={true}
            balance={fromBalance}
            tokens={this.state.tokens}
            token={this.state.fromToken}
            setToken={(value: string) => {
              if (value === this.state.toToken) {
                // switch
                this.setState({
                  fromToken: value,
                  toToken: this.state.fromToken,
                });
              } else {
                this.setState({
                  fromToken: value,
                });
              }
            }}
            amount={this.state.fromInput}
            isEstimated={false /* this.state.isFromEstimated */}
            setAmount={(value: string) => {
              if (value === '' || Number(value) === 0) {
                this.setState({
                  fromInput: value,
                  isFromEstimated: false,
                  toInput: '',
                  isToEstimated: false,
                  spread: 0,
                  commission: 0,
                  priceImpact: 0,
                });
                return;
              }

              this.setState(
                {
                  fromInput: value,
                  isFromEstimated: false,
                  isToEstimated: true,
                },
                () => this.updateInputs(),
              );
            }}
          />
          <div
            style={{
              padding: '1em',
              display: 'flex',
              flexDirection: 'row',
              alignContent: 'center',
            }}
          >
            {flexRowSpace}
            <span
              style={{ cursor: 'pointer' }}
              onClick={() => {
                this.setState(
                  {
                    toToken: this.state.fromToken,
                    toInput: this.state.fromInput,
                    isToEstimated: this.state.isFromEstimated,

                    fromToken: this.state.toToken,
                    fromInput: this.state.toInput,
                    isFromEstimated: this.state.isToEstimated,
                  },
                  () => this.updateInputs(),
                );
              }}
            >
              {downArrow}
            </span>
            {flexRowSpace}
          </div>
          <SwapAssetRow
            isFrom={false}
            balance={toBalance}
            tokens={this.state.tokens}
            token={this.state.toToken}
            setToken={(value: string) => {
              if (value === this.state.fromToken) {
                // switch
                this.setState({
                  toToken: value,
                  fromToken: this.state.toToken,
                });
              } else {
                this.setState({
                  toToken: value,
                });
              }
            }}
            amount={this.state.toInput}
            isEstimated={
              this.state.toInput !== '' /* this.state.isToEstimated */
            }
            setAmount={(value: string) => {
              if (value === '' || Number(value) === 0) {
                this.setState({
                  toInput: value,
                  isToEstimated: false,
                  fromInput: '',
                  isFromEstimated: false,
                  spread: 0,
                  commission: 0,
                  priceImpact: 0,
                });
                return;
              }

              this.setState(
                {
                  toInput: value,
                  isToEstimated: false,
                  isFromEstimated: true,
                },
                () => this.updateInputs(),
              );
            }}
          />
          {!hidePriceRow && (
            <PriceAndSlippage
              toToken={this.state.toToken}
              fromToken={this.state.fromToken}
              price={Number(this.state.toInput) / Number(this.state.fromInput)}
              slippageTolerance={this.state.slippageTolerance}
              setSlippageTolerance={slippageTolerance => {
                this.setState({ slippageTolerance });
              }}
            />
          )}
          <Button
            disabled={
              buttonMessage !== BUTTON_MSG_SWAP || this.state.loadingSwap
            }
            loading={this.state.loadingSwap}
            primary={buttonMessage === BUTTON_MSG_SWAP}
            fluid
            style={{
              margin: '1em 0 0 0',
              borderRadius: '12px',
              padding: '18px',
              fontSize: '20px',
            }}
            onClick={async () => {
              if (this.state.priceImpact >= 0.15) {
                const confirmString = 'confirm';
                const confirm = prompt(
                  `Price impact for this swap is very high. Please type the word "${confirmString}" to continue.`,
                );
                if (confirm !== confirmString) {
                  return;
                }
              }

              this.setState({ loadingSwap: true });

              try {
                const pair = this.state.pairFromSymbol[
                  `${this.state.fromToken}/${this.state.toToken}`
                ];

                const amountInTokenDenom = mulDecimals(
                  this.state.fromInput,
                  this.state.tokens[this.state.fromToken].decimals,
                ).toString();

                /* 
                        offer_amount    - exactly how much we're sending
                        ask_amount      - roughly how much we're getting
                        expected_return - at least ask_amount minus some slippage
                        
                        belief_price:
                          calculated from this line:
                          https://github.com/enigmampc/SecretSwap/blob/6135f0ad74a17cefacf4ac0e48497983b88dae91/contracts/secretswap_pair/src/contract.rs#L674
                        max_spread:
                          always zero, because we want this condition to always be true if `return_amount < expected_return`:
                          https://github.com/enigmampc/SecretSwap/blob/6135f0ad74a17cefacf4ac0e48497983b88dae91/contracts/secretswap_pair/src/contract.rs#L677-L678 
                      */
                const offer_amount = Number(this.state.fromInput);
                const ask_amount = Number(this.state.toInput);
                const expected_return =
                  ask_amount * (1 - this.state.slippageTolerance);
                const belief_price = beliefPriceNumberFormat.format(
                  reverse_decimal(expected_return / offer_amount),
                );
                const max_spread = '0';

                if (this.state.fromToken === 'SCRT') {
                  await this.secretjs.execute(
                    pair.contract_addr,
                    {
                      swap: {
                        offer_asset: {
                          info: { native_token: { denom: 'uscrt' } },
                          amount: amountInTokenDenom,
                        },
                        belief_price: belief_price,
                        max_spread: max_spread,
                        /*
                              offer_asset: Asset,
                              belief_price: Option<Decimal>,
                              max_spread: Option<Decimal>,
                              to: Option<HumanAddr>, // TODO 
                              */
                      },
                    },
                    '',
                    [
                      {
                        amount: amountInTokenDenom,
                        denom: 'uscrt',
                      },
                    ],
                  );
                } else {
                  await this.secretjs.execute(
                    this.state.tokens[this.state.fromToken].address,
                    {
                      send: {
                        recipient: pair.contract_addr,
                        amount: amountInTokenDenom,
                        msg: btoa(
                          JSON.stringify({
                            swap: {
                              belief_price: belief_price,
                              max_spread: max_spread,
                              /*
                                    belief_price: Option<Decimal>,
                                    max_spread: Option<Decimal>,
                                    to: Option<HumanAddr>, // TODO
                                    */
                            },
                          }),
                        ),
                      },
                    },
                  );
                }
              } catch (error) {
                console.error('Swap error', error);
                this.setState({
                  loadingSwap: false,
                });
                return;
              }

              this.setState({
                loadingSwap: false,
                toInput: '',
                fromInput: '',
              });
            }}
          >
            {buttonMessage}
          </Button>
        </Container>
        {!hidePriceRow && (
          <AdditionalInfo
            fromToken={this.state.fromToken}
            toToken={this.state.toToken}
            liquidityProviderFee={this.state.commission}
            priceImpact={this.state.priceImpact}
            minimumReceived={
              Number(this.state.toInput) * (1 - this.state.slippageTolerance)
              /*
              this.state.isToEstimated
                ? Number(this.state.toInput) *
                  (1 - this.state.slippageTolerance)
                : null
              */
            }
            /*
            maximumSold={
              this.state.isFromEstimated
                ? Number(this.state.fromInput) *
                  (1 + this.state.slippageTolerance)
                : null
            }
            */
          />
        )}
      </>
    );
  }
}
