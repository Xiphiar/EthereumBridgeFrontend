import { Button } from 'semantic-ui-react';
import { DepositRewards } from '../../../blockchain-bridge/scrt';
import React from 'react';
import { valueToDecimals } from '../../../utils';

const earnButtonStyle = {
  borderRadius: '50px',
  height: '47px',
  fontWeight: 500,
  width: "100%",
  color: "#2F80ED",
  backgroundColor: "transparent",
  border: "1px solid rgba(47, 128, 237, 0.5)",
};


// todo: add failed toast or something
const EarnButton = (props, value) => {
  return (
    <Button
      style={earnButtonStyle}
      onClick={() => {
        DepositRewards({
          secretjs: props.userStore.secretjs,
          recipient: props.token.rewardsContract,
          address: props.token.lockedAssetAddress,
          amount: valueToDecimals(value, props.token.decimals)}).catch(reason =>
            console.log(`Failed to deposit: ${reason}`)
        )
      }}
    >
      Earn
    </Button>
  );
}

export default EarnButton;
