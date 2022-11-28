// ******************************************************************************
// * @file    Ota.js
// * @author  MCD Application Team
// *
//  ******************************************************************************
//  * @attention
//  *
//  * Copyright (c) 2022-2023 STMicroelectronics.
//  * All rights reserved.
//  *
//  * This software is licensed under terms that can be found in the LICENSE file
//  * in the root directory of this software component.
//  * If no LICENSE file comes with this software, it is provided AS-IS.
//  *
//  ******************************************************************************
import React from 'react';
import { Buffer } from 'buffer';
import { createLogElement } from "../components/Header";
import { OverlayTrigger, Popover } from 'react-bootstrap';
import iconInfo from '../images/iconInfo.svg';

const REBOOT = 1;
const READY_TO_RECEIVE = 2;
const CHUNK_LENGTH = 240;
const SECTOR_SIZE = 8000;

let writeAddressCharacteristic;
let indicateCharacteristic;
let writeWithoutResponseCharacteristic;
let fileContent;
let fileLength;
let nbSector;
let uploadAction = "002";
let readyToReceive = false;

const Ota = (props) => {

    // Filtering the different datathroughput characteristics
    props.allCharacteristics.map(element => {
        switch (element.characteristic.uuid) {
            case "0000fe22-8e22-4541-9d4c-21edae82ed19":
                writeAddressCharacteristic = element;
                break;
            case "0000fe23-8e22-4541-9d4c-21edae82ed19":
                indicateCharacteristic = element;
                console.log("valeur de la car indicate");
                console.log(element);
                break;
            case "0000fe24-8e22-4541-9d4c-21edae82ed19":
                writeWithoutResponseCharacteristic = element;
                break;
            default:
                console.log("# No characteristics find..");
        }
    });

    // Authorize the reception of indications / notifications
    console.log('Indications ON');
    indicateCharacteristic.characteristic.startNotifications();
    indicateCharacteristic.characteristic.oncharacteristicvaluechanged = notifHandler;
    createLogElement(indicateCharacteristic, 3, "OTA ENABLE NOTIFICATION");


    // Notification / indications handler
    function notifHandler(event) {
        console.log("Notification / Indication :> received");
        var buf = new Uint8Array(event.target.value.buffer);
        console.log(buf);
        if (buf[0] === REBOOT){
          document.getElementById("uploadButton").innerHTML = `<div>Wait for disconnection...</div> <div class="spinner-border text-success" role="status" style={float:right}></div>`
        }
        else if(buf[0] == READY_TO_RECEIVE){
          readyToReceive = true;
          sliceAndSend();
        }
        createLogElement(buf, 2, "OTA NOTIFICATION");
    }

    // Send to device the action to be ready for the update of the firmware
    async function writeAddress() {
        let address = document.getElementById("startSectorInput").value
        let hexStringFistPart = address.substring(0,2);
        let hexStringSecondePart = address.substring(2,4);
        let hexStringThirdPart = address.substring(4,6);

        hexStringFistPart = parseInt(hexStringFistPart, 16);
        hexStringSecondePart = parseInt(hexStringSecondePart, 16);
        hexStringThirdPart = parseInt(hexStringThirdPart, 16);
        nbSector = parseInt(nbSector, 16);

        console.log(hexStringFistPart);
        console.log(hexStringSecondePart);
        console.log(hexStringThirdPart);

        // dec : 002 008 032 000
        // hex : 02 08 20 00
        let myWord = new Uint8Array(5);
        myWord[0] = uploadAction; // Action 
        myWord[1] = hexStringFistPart; // Address
        myWord[2] = hexStringSecondePart; // Address
        myWord[3] = hexStringThirdPart; // Address
        myWord[4] = nbSector; // Address
        try {
            await writeAddressCharacteristic.characteristic.writeValue(myWord);
            console.log("Writing >> " + myWord);
            createLogElement(myWord, 2, "OTA WRITE");
        }
        catch (error) {
            console.log('2 : Argh! ' + error);
        }
    }

    function indicationTimeout() {
      document.getElementById("uploadButton").innerHTML = `<div>Something went wrong... Please reset the device and wait for disconnection</div> <div class="spinner-border text-danger" role="status" style={float:right}></div>`
    }
    

    async function onUploadButtonClick() {
      
      fileLength = fileContent.length;
      nbSector = fileLength/SECTOR_SIZE;
      console.log("NbSector = ");
      nbSector = Math.ceil(nbSector);
      console.log(nbSector);
      // Send to device the base memory address (sector 7)
      writeAddress();
      sliceAndSend();
    }

    async function sliceAndSend(){
      let progressUploadBar = document.getElementById('progressUploadBar');
      let start = 0;
      let end = CHUNK_LENGTH;
      let sub;
      let totalBytes = 0;
      //fileLength = fileContent.length;

      if(readyToReceive == true){
        // Slice the fileContent (the binary file) into small chucks of CHUNK_LENGTH
        // And send them to the device
        // Start the timer
        var startTime = performance.now()
        for (let i = 0; i < fileLength/CHUNK_LENGTH; i++) {
            sub = fileContent.slice(start, end);
            console.log(sub);
            start = end;
            end += CHUNK_LENGTH;
            await writeWithoutResponseCharacteristic.characteristic.writeValue(sub)
            // createLogElement(sub, 2, "OTA WRITE");
            totalBytes += sub.byteLength
            console.log("progressUploadBar");
            console.log(progressUploadBar);
            progressUploadBar.setAttribute('style','width:'+Number((totalBytes * 100) / fileLength)+'%');
            console.log(i + "> (" + totalBytes + ") writing " + sub.byteLength + ' bytes..');
        }

        // Send to device the action : file is finish to upload
        let FileUploadFinished = new Uint8Array(1);
        FileUploadFinished[0] = "007";
        await writeAddressCharacteristic.characteristic.writeValue(FileUploadFinished);
        console.log(FileUploadFinished);
        createLogElement(FileUploadFinished, 2, "OTA WRITE");
        // Stop the timer
        var endTime = performance.now()
        console.log(`The firmware update took : ${endTime - startTime} milliseconds`);
        let uploadButton = document.getElementById("uploadButton")
        uploadButton.disabled = true;
        uploadButton.innerHTML = `<div> Wait for disconnection...</div> <div class="spinner-border" role="status" style={float:right}></div>`
        // setTimeout(indicationTimeout, 30000)
      } else {
        console.log(" Not ready to receive ...");
      }
    }

    // Read the file selected from the file input and upload it
    function showFile(input) {
      console.log("FileLoader")
      let uploadButton = document.getElementById("uploadButton");
      uploadButton.disabled = true;
        fileContent = input.target.files[0];
        let reader = new FileReader();
        reader.readAsArrayBuffer(fileContent);
        reader.onload = async function () {
            let uint8View = new Uint8Array(reader.result);
            console.log(uint8View);
            fileContent = uint8View;
        }
        uploadButton.disabled = false;
    }

/*
    function handlerRadioSector(){
        let selectedBinary = document.getElementsByName("selectBinary");
        //document.getElementById("rebootSelectFilePart").style="display:''";
        //console.log(selectedBinary)
        for (let i = 0; i < selectedBinary.length; i++){
          if(selectedBinary[i].checked){
            switch (selectedBinary[i].value){
              case "P2P":
                console.log(" On charge le P2P server ! ")
                //document.getElementById("P2Pfetch").value = "https://api.github.com/repos/STMicroelectronics/STM32CubeWB/contents/Projects/P-NUCLEO-WB55.Nucleo/Applications/BLE/BLE_p2pServer_ota/Binary/BLE_p2pServer_ota_reference.bin";
                //document.getElementById("HRfetch").value = "https://api.github.com/repos/STMicroelectronics/STM32CubeWB/contents/Projects/P-NUCLEO-WB55.Nucleo/Applications/BLE/BLE_HeartRate_ota/Binary/BLE_HeartRate_ota_reference.bin";
                break;
              case "HR":
                console.log(" On charge le Heart Rate ! ")
                break;
            }
          }
        }
      }
*/

  async function onActionRadioButtonClick(){
    let selectedAction = document.getElementsByName("selectAction");
    for (let i = 0; i < selectedAction.length; i++){
      if(selectedAction[i].checked){
        selectedAction = selectedAction[i].value;
      }
  }
    console.log(selectedAction);
    switch (selectedAction){
      case 'userData':
        document.getElementById("userDataSelectFilePart").style="display:block";
        document.getElementById("applicationSelectFilePart").style="display:none";
        break;
      case 'application':
        document.getElementById("userDataSelectFilePart").style="display:none";
        document.getElementById("applicationSelectFilePart").style="display:block";
        break;
    }
  }

  const popoverUserData = (
    <Popover id="popover-trigger-hover-focus" title="Popover bottom">
      <strong>Info :</strong> In contains the User Data that need to be kept along with firmware update.​
    </Popover>
  );
  
  const popoverApplicationBinary = (
    <Popover id="popover-trigger-hover-focus" title="Popover bottom">
      <strong>Info :</strong> Choose either a file from your device or file fetch from the STMicroelectronics Hotspot. <br />
      Then choose the first sector address. (default 0x82000).
    </Popover>
  );

    return (
    <div className="container-fluid">
        <div className="container">

          <div className="input-group">
            <div className="input-group-text">
              <input className="form-check-input mt-0" type="radio" value="userData" name='selectAction' onClick={onActionRadioButtonClick} ></input>
            </div>
            <input type="text" disabled={true} className="form-control" aria-label="Text input with radio button" value="User Data Update"></input>
            </div>
          <div className="input-group">
            <div className="input-group-text">
              <input className="form-check-input mt-0" type="radio" value="application" name='selectAction' onClick={onActionRadioButtonClick} ></input>
            </div>
            <input type="text" disabled={true} className="form-control" aria-label="Text input with radio button" value="Application Update"></input>
          </div>


          <div id='userDataSelectFilePart' style={{"display": "none"}}>
            <div id='userDataBinaryList' style={{"display": "block"}}>
              <h3>User Data
                <OverlayTrigger
                  trigger={['hover', 'focus']}
                  placement="bottom"
                  overlay={popoverUserData}>
                  <img className="iconInfo" src={iconInfo} ></img>
                </OverlayTrigger>
              </h3>
            </div>
            <div className="mt-3 mb-3">
                <input className="form-control fileInput" type="file" onChange={(e) => showFile(e)}></input>
              </div> 
              <div className="input-group mb-3">
                <span className="input-group-text" id="startSectorChoise">Address 0x</span>
                <input type="text" className="form-control" placeholder="..." aria-describedby="startSectorChoise" maxLength="6" id="startSectorInput" defaultValue={"082000"}></input>
              </div>
              <button className="secondaryButton w-100 mb-3 has-spinner" type="button" onClick={onUploadButtonClick} id="uploadButton" disabled={false}>Upload</button>
              <div class="progress">
                  <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" id='progressUploadBar' aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style={{width: "0%"}}></div>
              </div>
            </div>

          <div id='applicationSelectFilePart' style={{"display": "none"}}>
            <div id='applicationBinaryList' style={{"display": "block"}}>
              <h3>Application
                <OverlayTrigger
                  trigger={['hover', 'focus']}
                  placement="bottom"
                  overlay={popoverApplicationBinary}>
                  <img className="iconInfo" src={iconInfo} ></img>
                </OverlayTrigger>
              </h3>
            </div>

            <div className="mt-3 mb-3">
              <input className="form-control fileInput" type="file" onChange={(e) => showFile(e)}></input>
            </div> 
            <div className="input-group mb-3">
              <span className="input-group-text" id="startSectorChoise">Address 0x</span>
              <input type="text" className="form-control" placeholder="..." aria-describedby="startSectorChoise" maxLength="6" id="startSectorInput" defaultValue={"082000"}></input>
            </div>
            <button className="secondaryButton w-100 mb-3 has-spinner" type="button" onClick={onUploadButtonClick} id="uploadButton" disabled={false}>Upload</button>
            <div class="progress">
                <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" id='progressUploadBar' aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style={{width: "0%"}}></div>
            </div>
          </div>
        </div>
    </div>

  );
};

export default Ota;