import * as React from 'react';
import styled, { withTheme } from 'styled-components';
import { Box, BoxProps, Text } from 'grommet';
import { useHistory } from 'react-router';
import { observer } from 'mobx-react-lite';
import { IStyledChildrenProps } from 'interfaces';
import { Title } from '../Base/components/Title';
import { useStores } from '../../stores';
import * as styles from './styles.styl';
import cn from 'classnames';
import { TOKEN } from '../../stores/interfaces';
// import { formatWithTwoDecimals } from '../../utils';

const MainLogo = styled.img`
  width: auto;
  height: 32px;
  margin-bottom: 4px;
`;

const getTokenServiceEnable = process.env.GET_TOKENS_SERVICE === 'true';

export const Head: React.FC<IStyledChildrenProps<BoxProps>> = withTheme(
  observer(({ theme, ...props }: IStyledChildrenProps<BoxProps>) => {
    const history = useHistory();
    const { routing, user, exchange, actionModals } = useStores();
    const { palette, container } = theme;
    const { minWidth, maxWidth } = container;

    const isExplorer = history.location.pathname === '/explorer';
    const isTokens = history.location.pathname === '/tokens';
    const isGetTokens = history.location.pathname === '/get-tokens';
    const isFaq = history.location.pathname === '/faq';
    const isInfo = history.location.pathname === '/info';

    const goToBridge = () => {
      if (exchange.operation && exchange.operation.id) {
        routing.push(
          `/${exchange.token || TOKEN.ETH}/operations/${exchange.operation.id}`,
        );
      } else {
        routing.push(`/${exchange.token || TOKEN.ETH}`);
      }
    };

    return (
      <Box
        style={{
          background: palette.StandardWhite,
          // background: '#f6f7fb',
          overflow: 'visible',
          position: 'absolute',
          top: 0,
          width: '100%',
          zIndex: 100,
          // boxShadow: '0px 0px 20px rgba(0, 0, 0, 0.2)',
        }}
      >
        <Box
          direction="row"
          align="center"
          justify="between"
          style={{
            minWidth,
            maxWidth,
            margin: '0 auto',
            padding: '0px 30px',
            height: 100,
            minHeight: 100,
            width: '100%',
          }}
        >
          <Box direction="row" align="center">
            {/* <Box
              align="center"
              margin={{ right: 'small' }}
              onClick={goToBridge}
            >
              <MainLogo src="/scrt.svg" />
            </Box> */}
            <a href="/" style={{ textDecoration: 'none' }}>
              <Box>
                <Title size="medium" color="BlackTxt" bold>
                  🌉 Secret Bridge
                </Title>
              </Box>
            </a>
          </Box>

          <Box direction="row" align="center" gap="15px">

            <Box
              className={cn(
                styles.itemToken,
                !isInfo && !isFaq && !isExplorer && !isGetTokens && !isTokens
                  ? styles.selected
                  : '',
              )}
              onClick={goToBridge}
            >
              <Text>Bridge</Text>
            </Box>

            <Box
              className={cn(styles.itemToken, isTokens ? styles.selected : '')}
              onClick={() => {
                routing.push(`/tokens`);
              }}
            >
              <Text>Assets</Text>
            </Box>

            <Box
              className={cn(
                styles.itemToken,
                isExplorer ? styles.selected : '',
              )}
              onClick={() => {
                routing.push(`/explorer`);
              }}
            >
              <Text>Transactions</Text>
            </Box>

            <Box
              className={cn(styles.itemToken, isInfo ? styles.selected : '')}
              onClick={() => routing.push('/info')}
            >
              <Text>Info</Text>
            </Box>

            <Box
              className={cn(styles.itemToken, isFaq ? styles.selected : '')}
              onClick={() => routing.push('/faq')}
            >
              <Text>FAQ</Text>
            </Box>

            {/*<Box*/}
            {/*  direction="column"*/}
            {/*  align="center"*/}
            {/*  gap="10px"*/}
            {/*  style={{ maxWidth: 300 }}*/}
            {/*  margin={{ left: '50px' }}*/}
            {/*>*/}
            {/*  <Box direction="row" fill={true} justify="between">*/}
            {/*    Total BUSD locked:{' '}*/}
            {/*    <b style={{ marginLeft: 10 }}>*/}
            {/*      {formatWithTwoDecimals(user.hmyBUSDBalanceManager)}*/}
            {/*    </b>*/}
            {/*  </Box>*/}
            {/*  <Box direction="row" fill={true} justify="between">*/}
            {/*    Total LINK locked:{' '}*/}
            {/*    <b style={{ marginLeft: 10 }}>*/}
            {/*      {formatWithTwoDecimals(user.hmyLINKBalanceManager)}*/}
            {/*    </b>*/}
            {/*  </Box>*/}
            {/*</Box>*/}
          </Box>
        </Box>
      </Box>
    );
  }),
);
