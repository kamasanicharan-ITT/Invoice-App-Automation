# Dataverse Schema

Generated from DEV Dataverse (`https://dev-itt-apps.crm8.dynamics.com`).

## 1. `dia_project` (Project)

Filter: `AttributeType ne 'Virtual'`

| Display Name | Logical Name | Type | Required |
|---|---|---|---|
| Created By | `createdby` | Lookup | None |
| (no display name) | `createdbyname` | String | None |
| (no display name) | `createdbyyominame` | String | SystemRequired |
| Created On | `createdon` | DateTime | None |
| Created By (Delegate) | `createdonbehalfby` | Lookup | None |
| (no display name) | `createdonbehalfbyname` | String | None |
| (no display name) | `createdonbehalfbyyominame` | String | SystemRequired |
| Account ID (Deprecated) | `dia_accountid` | Lookup | None |
| (no display name) | `dia_accountidname` | String | None |
| (no display name) | `dia_accountidyominame` | String | None |
| Billing Attn | `dia_billingattn` | String | None |
| City | `dia_city` | String | None |
| Client Code | `dia_clientcode` | String | None |
| (no display name) | `dia_contracts_name` | String | None |
| Country | `dia_country` | String | None |
| Creator | `dia_creator` | String | None |
| Customer Sent Date | `dia_customersentdate` | DateTime | None |
| ID | `dia_id` | String | ApplicationRequired |
| IsActive | `dia_isactive` | Integer | None |
| Net Terms | `dia_netterms` | String | None |
| Net Terms Code | `dia_nettermscode` | String | None |
| Notification Display Button  | `dia_notificationdisplaybutton` | Picklist | None |
| Notification Reason | `dia_notificationreason` | String | None |
| Partner Approver list | `dia_partnerapproverlist` | String | None |
| Partner ID | `dia_partnerid` | Lookup | None |
| (no display name) | `dia_partneridname` | String | None |
| PO Number | `dia_ponumber` | String | None |
| Project Category ID | `dia_projectcategoryid` | String | None |
| Project Ending | `dia_projectending` | Boolean | None |
| Project | `dia_projectid` | Uniqueidentifier | SystemRequired |
| Project Name | `dia_projectname` | String | None |
| Project Status | `dia_projectstatus` | String | None |
| State | `dia_state` | String | None |
| Stop Notification Button Clicked | `dia_stopnotificationbuttonclicked` | Boolean | None |
| Street Address | `dia_streetaddress` | String | None |
| Submitter | `dia_submitter` | String | None |
| Zip Code | `dia_zipcode` | String | None |
| Import Sequence Number | `importsequencenumber` | Integer | None |
| Account | `ittdev_account` | Lookup | ApplicationRequired |
| (no display name) | `ittdev_accountname` | String | None |
| (no display name) | `ittdev_accountyominame` | String | None |
| Billing Attention Name Deprecated | `ittdev_billingattentionname` | Lookup | None |
| (no display name) | `ittdev_billingattentionnamename` | String | None |
| (no display name) | `ittdev_billingattentionnameyominame` | String | None |
| Billing Quantity Type | `ittdev_billingquantitytype` | Picklist | Recommended |
| Check Resource Allocation Discrepancy | `ittdev_checkresourceallocationdiscrepancy` | Boolean | None |
| Class | `ittdev_class` | Picklist | None |
| Invoice Day | `ittdev_invoiceday` | Picklist | ApplicationRequired |
| Invoice Frequency | `ittdev_invoicefrequency` | Picklist | ApplicationRequired |
| Organization | `ittdev_organization` | Picklist | None |
| Payment Type | `ittdev_paymenttype` | Picklist | ApplicationRequired |
| Project Currency | `ittdev_projectcurrency` | Lookup | Recommended |
| (no display name) | `ittdev_projectcurrencyname` | String | None |
| Project Manager (Deprecated) | `ittdev_projectmanager` | Lookup | None |
| (no display name) | `ittdev_projectmanagername` | String | None |
| Project Objectives | `ittdev_projectobjectives` | String | None |
| Region | `ittdev_region` | Picklist | Recommended |
| Send Invoices via system | `ittdev_sendinvoicesviasystem` | Boolean | None |
| Sub Company name | `ittdev_subcompanyname` | String | None |
| Total HC | `ittdev_totalhc` | Decimal | None |
| Total HC (Last Updated On) | `ittdev_totalhc_date` | DateTime | None |
| Total HC (State) | `ittdev_totalhc_state` | Integer | None |
| Total Paid HC | `ittdev_totalpaidhc` | Decimal | None |
| Total Paid HC (Last Updated On) | `ittdev_totalpaidhc_date` | DateTime | None |
| Total Paid HC (State) | `ittdev_totalpaidhc_state` | Integer | None |
| NotificationReason_Not Used(Deprecated) | `mdapp_notificationreason` | String | None |
| NotificationRequired_Not Used(Deprecated) | `mdapp_notificationrequired` | Boolean | None |
| Modified By | `modifiedby` | Lookup | None |
| (no display name) | `modifiedbyname` | String | None |
| (no display name) | `modifiedbyyominame` | String | SystemRequired |
| Modified On | `modifiedon` | DateTime | None |
| Modified By (Delegate) | `modifiedonbehalfby` | Lookup | None |
| (no display name) | `modifiedonbehalfbyname` | String | None |
| (no display name) | `modifiedonbehalfbyyominame` | String | SystemRequired |
| Record Created On | `overriddencreatedon` | DateTime | None |
| Project Manager (Owner) | `ownerid` | Owner | SystemRequired |
| (no display name) | `owneridname` | String | SystemRequired |
| (no display name) | `owneridtype` | EntityName | SystemRequired |
| (no display name) | `owneridyominame` | String | SystemRequired |
| Owning Business Unit | `owningbusinessunit` | Lookup | None |
| (no display name) | `owningbusinessunitname` | String | SystemRequired |
| Owning Team | `owningteam` | Lookup | None |
| Owning User | `owninguser` | Lookup | None |
| Status | `statecode` | State | SystemRequired |
| Status Reason | `statuscode` | Status | None |
| Time Zone Rule Version Number | `timezoneruleversionnumber` | Integer | None |
| UTC Conversion Time Zone Code | `utcconversiontimezonecode` | Integer | None |
| Version Number | `versionnumber` | BigInt | None |

**88 columns**

## 2. `dia_productservices` (Product/ Services)

| Display Name | Logical Name | Type | Required |
|---|---|---|---|
| Is Resource Based | `cr32e_isresourcebased` | Boolean | ApplicationRequired |
| (no display name) | `cr32e_isresourcebasedname` | Virtual | None |
| Created By | `createdby` | Lookup | None |
| (no display name) | `createdbyname` | String | None |
| (no display name) | `createdbyyominame` | String | SystemRequired |
| Created On | `createdon` | DateTime | None |
| Created By (Delegate) | `createdonbehalfby` | Lookup | None |
| (no display name) | `createdonbehalfbyname` | String | None |
| (no display name) | `createdonbehalfbyyominame` | String | SystemRequired |
| ID | `dia_id` | String | None |
| IsActive | `dia_isactive` | String | None |
| Item Account Reference ID | `dia_itemaccountreferenceid` | Integer | None |
| Item ID | `dia_itemid` | String | None |
| Product/ Service Name | `dia_productservicename` | String | None |
| ProductServiceRate | `dia_productservicerate` | Decimal | None |
| Product/ Services | `dia_productservicesid` | Uniqueidentifier | SystemRequired |
| Service Type | `dia_servicetype` | String | None |
| Unit Price | `dia_unitprice` | Money | None |
| Unit Price (Base) | `dia_unitprice_base` | Money | None |
| Exchange Rate | `exchangerate` | Decimal | None |
| Import Sequence Number | `importsequencenumber` | Integer | None |
| Is Tax Exempt | `ittdev_istaxexempt` | Boolean | None |
| (no display name) | `ittdev_istaxexemptname` | Virtual | None |
| Product/ Service Type | `ittdev_productservicetype` | Picklist | ApplicationRequired |
| (no display name) | `ittdev_productservicetypename` | Virtual | None |
| Modified By | `modifiedby` | Lookup | None |
| (no display name) | `modifiedbyname` | String | None |
| (no display name) | `modifiedbyyominame` | String | SystemRequired |
| Modified On | `modifiedon` | DateTime | None |
| Modified By (Delegate) | `modifiedonbehalfby` | Lookup | None |
| (no display name) | `modifiedonbehalfbyname` | String | None |
| (no display name) | `modifiedonbehalfbyyominame` | String | SystemRequired |
| Record Created On | `overriddencreatedon` | DateTime | None |
| Owner | `ownerid` | Owner | SystemRequired |
| (no display name) | `owneridname` | String | SystemRequired |
| (no display name) | `owneridtype` | EntityName | SystemRequired |
| (no display name) | `owneridyominame` | String | SystemRequired |
| Owning Business Unit | `owningbusinessunit` | Lookup | None |
| (no display name) | `owningbusinessunitname` | String | SystemRequired |
| Owning Team | `owningteam` | Lookup | None |
| Owning User | `owninguser` | Lookup | None |
| Status | `statecode` | State | SystemRequired |
| (no display name) | `statecodename` | Virtual | None |
| Status Reason | `statuscode` | Status | None |
| (no display name) | `statuscodename` | Virtual | None |
| Time Zone Rule Version Number | `timezoneruleversionnumber` | Integer | None |
| Currency | `transactioncurrencyid` | Lookup | None |
| (no display name) | `transactioncurrencyidname` | String | None |
| UTC Conversion Time Zone Code | `utcconversiontimezonecode` | Integer | None |
| Version Number | `versionnumber` | BigInt | None |

**50 columns**

## 3. `dia_invoicelineitemdetails` (Billing Info)

| Display Name | Logical Name | Type | Required |
|---|---|---|---|
| Created By | `createdby` | Lookup | None |
| (no display name) | `createdbyname` | String | None |
| (no display name) | `createdbyyominame` | String | SystemRequired |
| Created On | `createdon` | DateTime | None |
| Created By (Delegate) | `createdonbehalfby` | Lookup | None |
| (no display name) | `createdonbehalfbyname` | String | None |
| (no display name) | `createdonbehalfbyyominame` | String | SystemRequired |
| Description | `dia_description` | String | None |
| ID | `dia_id` | String | None |
| Invoice ID | `dia_invoiceid` | Lookup | None |
| (no display name) | `dia_invoiceidname` | String | None |
| Invoice Line Item Details | `dia_invoicelineitemdetailsid` | Uniqueidentifier | SystemRequired |
| Item Description | `dia_itemdescription` | Memo | None |
| Product/ Service ID | `dia_productserviceid` | Integer | None |
| Quantity | `dia_quantity` | String | None |
| Rate | `dia_rate` | Decimal | None |
| Total | `dia_total` | Decimal | None |
| Total Amount(Deprecated) | `dia_totalamount` | Integer | None |
| Exchange Rate | `exchangerate` | Decimal | None |
| Import Sequence Number | `importsequencenumber` | Integer | None |
| Line Item Total (Deprecated) | `ittdev_lineitemtotal` | Money | None |
| Line Item Total (Base) (Deprecated) | `ittdev_lineitemtotal_base` | Money | None |
| Modified By | `modifiedby` | Lookup | None |
| (no display name) | `modifiedbyname` | String | None |
| (no display name) | `modifiedbyyominame` | String | SystemRequired |
| Modified On | `modifiedon` | DateTime | None |
| Modified By (Delegate) | `modifiedonbehalfby` | Lookup | None |
| (no display name) | `modifiedonbehalfbyname` | String | None |
| (no display name) | `modifiedonbehalfbyyominame` | String | SystemRequired |
| Record Created On | `overriddencreatedon` | DateTime | None |
| Owner | `ownerid` | Owner | SystemRequired |
| (no display name) | `owneridname` | String | SystemRequired |
| (no display name) | `owneridtype` | EntityName | SystemRequired |
| (no display name) | `owneridyominame` | String | SystemRequired |
| Owning Business Unit | `owningbusinessunit` | Lookup | None |
| (no display name) | `owningbusinessunitname` | String | SystemRequired |
| Owning Team | `owningteam` | Lookup | None |
| Owning User | `owninguser` | Lookup | None |
| Status | `statecode` | State | SystemRequired |
| (no display name) | `statecodename` | Virtual | None |
| Status Reason | `statuscode` | Status | None |
| (no display name) | `statuscodename` | Virtual | None |
| Time Zone Rule Version Number | `timezoneruleversionnumber` | Integer | None |
| Currency (Deprecated) | `transactioncurrencyid` | Lookup | None |
| (no display name) | `transactioncurrencyidname` | String | None |
| UTC Conversion Time Zone Code | `utcconversiontimezonecode` | Integer | None |
| Version Number | `versionnumber` | BigInt | None |

**47 columns**
