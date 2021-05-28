import cogoToast from 'cogo-toast';
import { BaseContainer, PageContainer } from 'components'
import { ArrowDown } from 'components/Base/components/Icons/tsx_svg_icons';
import { Box } from 'grommet'
import { observer } from 'mobx-react';
import React from 'react'
import { Button } from 'semantic-ui-react';
import { useStores } from 'stores';
import "./style.scss";

export const Cashback =observer((props)=>{
    const {theme,user} = useStores();
    const [loading,setLoading]=React.useState(false);
    const hasCashback = user?.balanceCSHBK != '0';

    function notify(type: 'success' | 'error' | 'errorWithHash', msg: string, hideAfterSec: number = 120, txHash?: string) {
      let cogoType: string = type;
      if (type === 'error') {
        msg = msg.replaceAll('Failed to decrypt the following error message: ', '');
        msg = msg.replace(/\. Decryption error of the error message:.+?/, '');
      }

      let onClick = () => {
        hide();
      };
      if (type === 'errorWithHash') {
        cogoType = 'warn';
        onClick = () => {
          const url = `https://secretnodes.com/secret/chains/secret-2/transactions/${txHash}`;
          const win = window.open(url, '_blank');
          win.focus();
          hide();
        };
      }

      const { hide } = cogoToast[cogoType](msg, {
        toastContainerID:'notifications_container', 
        hideAfter: hideAfterSec,
        onClick,
      });
      // NotificationManager[type](undefined, msg, closesAfterMs);
    }

    const burnSEFI = async () => {
      if(user?.balanceCSHBK){
        try {
          setLoading(true)
          const expected_sefi = user.expectedSEFIFromCSHBK;
          const cashbak = user.balanceCSHBK;
          await user.ConvertCHSBKToSEFI(); 
          notify('success',`You have claimed ${cashbak} CSHBK into ${expected_sefi} SEFI tokens!`)
          setLoading(false)
          console.log("You've claimed CSHBK")
        } catch (error) {
          notify('error',"Error when burning CSHBK to SEFI")
          setLoading(false)
          console.error(error)
        }
      }
    }

    const topRightChart = 514;
    const topLeftChart = 14;
    const topLeftLabel = 50.5;
    const topRightLabel = 575.5;
    const maxLimit= Math.round(user?.ratioCSHBK+1) || 1

    const sefi_earned = localStorage.getItem('total_sefi_earned')
    const cb_received = localStorage.getItem('total_cb_received')
    
    const rateCSHBK = user?.ratioCSHBK || .6 //Default value .60 meantime it loads 
    const fontColor = theme.currentTheme=='light'?'#5F5F6B':'white'

    let minLimit=(rateCSHBK <=  0.5)?0: 0.5
    let ratioColor,xPositionChart,xPositionLabel,xPositionArrow;
    // Calculating X positions base on Rate CSHBK
    if(rateCSHBK >= maxLimit){
      //Equal or HIGHER than minimun limit
      xPositionChart= topRightChart
      xPositionLabel= topRightLabel
      xPositionArrow=topRightLabel;

    }else if(rateCSHBK <= minLimit){
      //Equal or LOWER than minimun limit
      xPositionChart =topLeftChart
      xPositionLabel =topLeftLabel
      xPositionArrow=topLeftLabel;

    }else{
      //Calculations
      const lengthBar = maxLimit - minLimit;
      const relative_porcentage = ((rateCSHBK * 100)/lengthBar);
      const pixels_one_percentage_chart = (topRightChart-topLeftChart)/100;
      const pixels_one_percentage_label = (topRightLabel-topLeftLabel)/100;
      xPositionChart = ((relative_porcentage * pixels_one_percentage_chart)+topLeftChart).toFixed(2);
      xPositionLabel = ((relative_porcentage * pixels_one_percentage_label)+topLeftLabel).toFixed(2);
      xPositionArrow = xPositionLabel-5;
    }

    //Calculating color of rate value
    if(rateCSHBK > minLimit && rateCSHBK < maxLimit){
      ratioColor='#c7b517'
    }else if(rateCSHBK > minLimit){
      ratioColor='#79CC81'
    }else{
      ratioColor='#FF726E'
    }

    const balanceCSHBK = parseFloat(user.balanceCSHBK || '0.0').toFixed(2)
    return(
      <BaseContainer>
        <PageContainer>
          <Box className="cashback-container">
            <h1 className={`trade-more__title ${theme.currentTheme}`}>Trade more, earn more.</h1>
            <div className={`cashback-container__card ${theme.currentTheme}`}>
              <div className="congratulations-container">
                {
                  (user.isUnconnected == 'true')
                  ? <>
                      <h1 className='connect_wallet'>PLEASE CONNECT YOUR WALLET</h1>
                      <p>You haven't traded recently on </p>
                      <h3><strong>secret</strong>swap</h3>
                      <p>You have earned</p>
                      <h2>0.0 CSHBK </h2>
                    </> 
                  : (hasCashback)
                    ? <>
                        <h1>Congratulations</h1>
                        <p>For trading on</p>
                        <h3><strong>secret</strong>swap</h3>
                        <p>You have earned</p>
                        <h2>{balanceCSHBK} CSHBK </h2>
                        <p>that you can trade for</p>
                        <h2>{user.expectedSEFIFromCSHBK} SEFI</h2>
                      </>
                    : <>
                      <h1>Too Bad !</h1> 
                      <p>You haven't traded recently on </p>
                      <h3><strong>secret</strong>swap</h3>
                      <p>You have earned</p>
                      <h2>0.0 CSHBK </h2>
                    </>
                }
                
              </div>
              <div className="call-toAction__container">
                <img src="/static/robot-cashback.png" alt="Rockstart robot"  />
                <Button 
                  loading={loading}
                  disabled={!hasCashback}
                  className="redeem-sefi__button" 
                  onClick={burnSEFI}>
                    Redem for SEFI 
                </Button>
              </div>
            </div>
            <div className={`rate-bar__container ${theme.currentTheme}`}>
              <div className='rate-labels__container'>
                  <svg width="631" height="94" viewBox="0 0 631 94" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <text x={xPositionLabel} textAnchor='middle' y='30%' fill={fontColor}>Current Rate</text>
                      <text x={xPositionLabel} textAnchor='middle' y='60%' fill={ratioColor}>{rateCSHBK}</text>
                      <ArrowDown x={xPositionArrow} y='25' stroke={fontColor} width='10px'/>
                  </svg>
              </div>
              <div className="rate-svg__container">
                <svg width="528" height="94" viewBox="0 0 528 94" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <text fill="#FF726E" x={topLeftChart} y='10' textAnchor='middle'>Bad</text>
                  <text fill="#79CC81" x={topRightChart - 5 } y='10' textAnchor='middle'>Good</text>
                  <rect x="4" y="21" width="520" height="22" rx="11" fill="url(#paint0_linear)"/>
                  <path d={`M${xPositionChart} 21V43`} stroke={fontColor}/>
                  <path d="M14 53V73" stroke={fontColor}/>
                  <path d="M139 53V63" stroke={fontColor}/>
                  <path d="M264 53V73" stroke={fontColor}/>
                  <path d="M389 53V63" stroke={fontColor}/>
                  <path d="M514 53V73" stroke={fontColor}/>
                  <text fill={fontColor} x={topLeftChart} y='90' textAnchor='middle'>{minLimit}</text>
                  <text fill={fontColor} x={topRightChart } y='90' textAnchor='middle'>{maxLimit}</text>
                  <text fill={fontColor} x={(topRightChart-topLeftChart)/2 + topLeftChart} y='90' textAnchor='middle'>{maxLimit/2}</text>
                  <defs>
                  <linearGradient id="paint0_linear" x1="14" y1="31.9999" x2="514" y2="32.0001" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FF726E"/>
                  <stop offset="0.507078" stopColor="#F8EC99"/>
                  <stop offset="1" stopColor="#79CC81"/>
                  </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
            <div className={`additional-info__container ${theme.currentTheme}`}>
              <div className='additional-info__row'>
                <p>Total Cashback Received</p>
                <strong>{(cb_received)?cb_received:'0.0'} CSHBK</strong>
              </div>
              <div className='additional-info__row'>
                <p>SEFI Earned from Cashback</p>
                <strong>{(sefi_earned)?sefi_earned:'0.0'} SEFI</strong>
              </div>
            </div>
          </Box>
      </PageContainer>
    </BaseContainer>
    )
  }
)